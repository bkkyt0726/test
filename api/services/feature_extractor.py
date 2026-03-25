"""
파싱된 프리셋에서 기능(feature) 단위로 구조화된 데이터를 추출합니다.
여러 파일의 피처를 비교·통합하기 위한 공통 스키마를 제공합니다.

Toggle 정의(customPromptTemplateToggle)가 있으면 Toggle 기준으로,
없으면 role/type2 카테고리 기준으로 블록을 분류합니다.
"""

import re
from typing import Any

from api.services.risup_analyzer import _extract_gen_params, _extract_metadata


# ──────────────────────────────────────────────
# Toggle 파싱
# ──────────────────────────────────────────────

def _parse_toggles(raw: str) -> list[dict[str, Any]]:
    """
    customPromptTemplateToggle 문자열을 파싱합니다.

    라인 형식:
      =label=group        → 그룹 시작
      =label=groupEnd     → 그룹 종료
      =label=divider      → 구분선 (토글 아님)
      key=label           → 단순 on/off 토글
      key=label=select=opt1,opt2,...  → 선택 토글
      key=label=text      → 텍스트 입력 토글
    """
    toggles: list[dict[str, Any]] = []
    current_group: str | None = None

    for line in raw.strip().split("\n"):
        line = line.strip()
        if not line:
            continue

        if line.startswith("="):
            inner = line[1:]
            parts = inner.rsplit("=", 1)
            label = parts[0]
            line_type = parts[1].lower() if len(parts) > 1 else "divider"
            if line_type == "group":
                current_group = label
            elif line_type == "groupend":
                current_group = None
            # divider: 상태 변경 없음
            continue

        # 토글 정의 라인
        parts = line.split("=", 3)
        key = parts[0]
        label = parts[1] if len(parts) > 1 else key
        toggle_type = parts[2].lower() if len(parts) > 2 else "toggle"

        entry: dict[str, Any] = {
            "key": key,
            "label": label,
            "type": toggle_type,   # toggle | select | text
            "group": current_group,
        }
        if toggle_type == "select" and len(parts) > 3:
            entry["options"] = parts[3].split(",")

        toggles.append(entry)

    return toggles


def _find_toggle_refs(content: str, toggle_keys: list[str]) -> list[str]:
    """블록 내용에서 참조되는 toggle key 목록을 반환합니다."""
    if not content:
        return []
    content_lower = content.lower()
    return [key for key in toggle_keys if f"toggle_{key.lower()}" in content_lower]


# ──────────────────────────────────────────────
# 카테고리 기반 분류 (Toggle 없을 때 fallback)
# ──────────────────────────────────────────────

def _get_category(role: str | None, type2: str | None) -> str:
    if type2 == "main":
        return "main"
    if type2 == "globalNote":
        return "global_note"
    if type2 == "authorNote":
        return "author_note"
    r = role or "system"
    if r == "user":
        return "user"
    if r == "bot":
        return "bot"
    if r == "all":
        return "all"
    return "system"


# ──────────────────────────────────────────────
# 메인 추출 함수
# ──────────────────────────────────────────────

def extract_features(preset: dict[str, Any], filename: str) -> dict[str, Any]:
    """
    단일 프리셋에서 기능 단위 데이터를 추출합니다.

    Toggle 정의가 있으면 toggle_definitions / 각 블록에 toggle_refs 포함.
    없으면 category 기반 분류만 제공.
    """
    toggle_raw: str = preset.get("customPromptTemplateToggle") or ""
    toggle_defs = _parse_toggles(toggle_raw) if toggle_raw.strip() else []
    toggle_keys = [t["key"] for t in toggle_defs]

    blocks = _extract_blocks(preset, filename, toggle_keys)
    regex_rules = _extract_regex(preset)
    token_biases = _extract_biases(preset)

    result: dict[str, Any] = {
        "filename": filename,
        "metadata": _extract_metadata(preset),
        "gen_params": _extract_gen_params(preset),
        "has_toggles": bool(toggle_defs),
        "prompt_blocks": blocks,
        "regex_rules": regex_rules,
        "token_biases": token_biases,
        "formatting_order": preset.get("formatingOrder") or [],
        "summary": {
            "total_blocks": len(blocks),
            "enabled_blocks": sum(1 for b in blocks if b["enabled"]),
            "total_chars": sum(b["char_count"] for b in blocks),
            "regex_count": len(regex_rules),
            "bias_count": len(token_biases),
        },
    }

    if toggle_defs:
        result["toggle_definitions"] = toggle_defs
        # customFlags: 활성화된 toggle 인덱스 배열
        result["active_toggle_indices"] = preset.get("customFlags") or []

    return result


def _extract_blocks(
    preset: dict[str, Any],
    filename: str,
    toggle_keys: list[str],
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for idx, item in enumerate(preset.get("promptTemplate") or []):
        if not isinstance(item, dict):
            continue
        text = item.get("text") or ""
        role = item.get("role") or "system"
        type2 = item.get("type2") or "normal"

        block: dict[str, Any] = {
            "id": str(idx),
            "name": item.get("name") or "",
            "content": text,
            "role": role,
            "type2": type2,
            "category": _get_category(role, type2),
            "enabled": item.get("enabled") is not False,
            "source_file": filename,
            "char_count": len(text),
        }
        if toggle_keys:
            block["toggle_refs"] = _find_toggle_refs(text, toggle_keys)

        blocks.append(block)
    return blocks


def _extract_regex(preset: dict[str, Any]) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for item in preset.get("regex") or []:
        if not isinstance(item, dict):
            continue
        rules.append({
            "comment": item.get("comment") or "",
            "pattern_in": item.get("in") or "",
            "pattern_out": item.get("out") or "",
            "type": item.get("type") or "",
            "enabled": bool(item.get("ableFlag", True)),
        })
    return rules


def _extract_biases(preset: dict[str, Any]) -> list[dict[str, Any]]:
    biases: list[dict[str, Any]] = []
    for item in preset.get("bias") or []:
        if isinstance(item, list) and len(item) == 2:
            biases.append({"token": str(item[0]), "weight": item[1]})
    return biases
