"""
파싱된 프리셋 dict에서 분석 결과를 추출합니다.
"""

from typing import Any


def analyze(preset: dict[str, Any]) -> dict[str, Any]:
    """
    파싱된 프리셋에서 구조화된 분석 결과를 추출합니다.

    반환 구조:
      metadata      - 이름, 버전 등 기본 정보
      prompt_blocks - 프롬프트 블록 목록 (이름, 내용, 역할 등)
      gen_params    - 생성 파라미터 (temperature 등)
      summary       - 통계 요약
    """
    metadata = _extract_metadata(preset)
    prompt_blocks = _extract_prompt_blocks(preset)
    gen_params = _extract_gen_params(preset)
    summary = _build_summary(prompt_blocks)

    return {
        "metadata": metadata,
        "prompt_blocks": prompt_blocks,
        "gen_params": gen_params,
        "summary": summary,
    }


def _extract_metadata(preset: dict[str, Any]) -> dict[str, Any]:
    meta = preset.get("_meta", {})
    return {
        "name": preset.get("name", ""),
        "preset_version": meta.get("presetVersion", 0),
        "description": preset.get("description", ""),
    }


def _extract_prompt_blocks(preset: dict[str, Any]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []

    # promptTemplate: 실제 프롬프트 블록 배열
    for idx, item in enumerate(preset.get("promptTemplate") or []):
        if not isinstance(item, dict):
            continue
        text = item.get("text") or ""
        blocks.append({
            "id": str(idx),
            "name": item.get("name") or "",
            "content": text,
            "role": item.get("role") or "system",
            "enabled": item.get("enabled") is not False,
            "source": item.get("type2") or "normal",
        })

    return blocks


_DISABLED_SENTINEL = -1000

# RisuAI 필드명 → 표준 출력 키 매핑
_GEN_PARAM_MAP: dict[str, str] = {
    "temperature": "temperature",
    "top_p": "top_p",
    "top_k": "top_k",
    "repetition_penalty": "repetition_penalty",
    "frequencyPenalty": "frequency_penalty",
    "PresensePenalty": "presence_penalty",
    "min_p": "min_p",
    "top_a": "top_a",
    "maxContext": "max_context",
    "maxResponse": "max_response",
}


def _extract_gen_params(preset: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for src_key, out_key in _GEN_PARAM_MAP.items():
        val = preset.get(src_key)
        if val is None or val == _DISABLED_SENTINEL:
            continue
        # temperature: RisuAI는 0-200 정수 (100 = 1.0) → float 변환
        if src_key == "temperature":
            result[out_key] = round(val / 100, 4)
        else:
            result[out_key] = val
    return result


def _build_summary(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    total_chars = sum(len(str(b.get("content", ""))) for b in blocks)
    enabled_count = sum(1 for b in blocks if b.get("enabled", True))
    return {
        "total_blocks": len(blocks),
        "enabled_blocks": enabled_count,
        "total_chars": total_chars,
    }
