"""
프리셋 dict를 수정하고 .risup 바이너리로 재인코딩합니다.

인코딩 파이프라인 (디코딩의 역순):
  preset dict
  → msgpack (inner)
  → AES-GCM 암호화
  → msgpack (outer wrapper)
  → gzip 압축
  → rpack 인코딩
"""

import copy
import gzip
import hashlib
from pathlib import Path
from typing import Any

import msgpack
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_RPACK_MAP_PATH = Path(__file__).parent.parent / "data" / "rpack_map.bin"
_encode_map: bytes | None = None


def _get_encode_map() -> bytes:
    global _encode_map
    if _encode_map is None:
        raw = _RPACK_MAP_PATH.read_bytes()
        if len(raw) != 512:
            raise RuntimeError(f"rpack_map.bin 크기 오류: {len(raw)}")
        _encode_map = raw[0:256]
    return _encode_map


def _rpack_encode(data: bytes) -> bytes:
    em = _get_encode_map()
    return bytes(em[b] for b in data)


def _encrypt_buffer(data: bytes, key_string: str) -> bytes:
    key = hashlib.sha256(key_string.encode()).digest()
    aesgcm = AESGCM(key)
    return aesgcm.encrypt(bytes(12), data, None)


def encode_risup(preset: dict[str, Any]) -> bytes:
    """preset dict → .risup 바이너리"""
    preset_version = preset.get("_meta", {}).get("presetVersion", 2)
    preset_clean = {k: v for k, v in preset.items() if not k.startswith("_")}

    inner = msgpack.packb(preset_clean, use_bin_type=True)
    encrypted = _encrypt_buffer(inner, "risupreset")
    outer = msgpack.packb(
        {"presetVersion": preset_version, "type": "preset", "preset": encrypted},
        use_bin_type=True,
    )
    return _rpack_encode(gzip.compress(outer))


# ──────────────────────────────────────────────
# 병합 로직
# ──────────────────────────────────────────────

def _remove_toggles(preset: dict[str, Any], toggle_keys: list[str]) -> dict[str, Any]:
    """선택한 toggle 키들과 관련 블록을 preset에서 제거합니다."""
    keys_to_remove = set(toggle_keys)
    if not keys_to_remove:
        return preset

    toggle_raw: str = preset.get("customPromptTemplateToggle") or ""
    if toggle_raw.strip():
        # Pass 1: toggle def 라인 제거
        pass1: list[str] = []
        for line in toggle_raw.split("\n"):
            stripped = line.strip()
            if not stripped or stripped.startswith("="):
                pass1.append(line)
            else:
                key = stripped.split("=", 1)[0]
                if key not in keys_to_remove:
                    pass1.append(line)

        # Pass 2: 빈 group 블록 제거
        cleaned: list[str] = []
        i = 0
        while i < len(pass1):
            stripped = pass1[i].strip()
            if stripped.startswith("=") and stripped.lower().endswith("=group"):
                # groupEnd까지 수집
                group: list[str] = [pass1[i]]
                i += 1
                while i < len(pass1):
                    group.append(pass1[i])
                    if pass1[i].strip().lower().endswith("=groupend"):
                        i += 1
                        break
                    i += 1
                # 실제 toggle def 라인이 있는지 확인 (첫·마지막 줄 제외)
                has_def = any(
                    ln.strip() and not ln.strip().startswith("=")
                    for ln in group[1:-1]
                )
                if has_def:
                    cleaned.extend(group)
                # else: 빈 group → 생략
            else:
                cleaned.append(pass1[i])
                i += 1

        preset["customPromptTemplateToggle"] = "\n".join(cleaned)

    # 해당 toggle을 참조하는 블록 제거
    template: list[Any] = list(preset.get("promptTemplate") or [])
    preset["promptTemplate"] = [
        b for b in template
        if not isinstance(b, dict) or not any(
            f"toggle_{k.lower()}" in (b.get("text") or "").lower()
            for k in keys_to_remove
        )
    ]
    return preset


def merge_preset(
    base_preset: dict[str, Any],
    additions: list[dict[str, Any]],
    conflict_resolutions: dict[str, str],  # toggle_key → "skip" | "add_alongside"
    removals: list[str] | None = None,
) -> dict[str, Any]:
    """
    base_preset에 additions를 병합합니다.

    additions 항목 구조:
      source_filename  - 원본 파일명
      toggle_key       - toggle 키
      toggle_label     - 표시 라벨
      toggle_def_line  - customPromptTemplateToggle 라인 원문
                         (None이면 기존 toggle에 삽입, 새 정의 생략)
      blocks           - [{name, content, role, type2, enabled}, ...]

    conflict_resolutions:
      "skip"         - 기존 base 유지 (추가 안 함)
      "add_alongside" - base에 추가 (둘 다 활성)

    removals:
      제거할 toggle key 목록 (addtions 적용 전에 먼저 처리)
    """
    result = copy.deepcopy(base_preset)

    # 제거 먼저 적용
    if removals:
        result = _remove_toggles(result, removals)
    base_toggle_raw: str = result.get("customPromptTemplateToggle") or ""
    base_toggle_keys = _extract_toggle_keys(base_toggle_raw)

    # 소스별로 묶어서 그룹 처리
    by_source: dict[str, list[dict[str, Any]]] = {}
    for addition in additions:
        key = addition["toggle_key"]
        if key in base_toggle_keys:
            resolution = conflict_resolutions.get(key, "skip")
            if resolution == "skip":
                continue
        source = addition.get("source_filename", "unknown")
        if source not in by_source:
            by_source[source] = []
        by_source[source].append(addition)

    new_toggle_lines: list[str] = []
    new_blocks: list[dict[str, Any]] = []

    for source, source_additions in by_source.items():
        # toggle_def_line=None 이면 기존 base toggle에 삽입 — 새 toggle 정의 생략
        additions_with_def = [
            a for a in source_additions if a.get("toggle_def_line") is not None
        ]
        if additions_with_def:
            new_toggle_lines.append(f"={source}=group")
            for addition in additions_with_def:
                fallback = (
                    f"{addition['toggle_key']}"
                    f"={addition.get('toggle_label', addition['toggle_key'])}"
                )
                line = addition["toggle_def_line"] or fallback
                new_toggle_lines.append(line)
            new_toggle_lines.append(f"={source}=groupEnd")

        for addition in source_additions:
            for block in addition.get("blocks", []):
                new_blocks.append({
                    "name": block.get("name") or "",
                    "text": block.get("content") or "",
                    "role": block.get("role") or "system",
                    "type2": block.get("type2") or "normal",
                    "enabled": block.get("enabled", True),
                })

    if new_toggle_lines:
        sep = "\n" if base_toggle_raw.strip() else ""
        result["customPromptTemplateToggle"] = (
            base_toggle_raw + sep + "\n".join(new_toggle_lines)
        )

    if new_blocks:
        template: list[Any] = list(result.get("promptTemplate") or [])
        template.extend(new_blocks)
        result["promptTemplate"] = template

    return result


def _extract_toggle_keys(raw: str) -> set[str]:
    keys: set[str] = set()
    for line in raw.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("="):
            continue
        parts = line.split("=", 1)
        if parts:
            keys.add(parts[0])
    return keys
