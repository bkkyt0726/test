import json
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from starlette.datastructures import UploadFile

from api.services.feature_extractor import extract_features
from api.services.risup_builder import encode_risup, merge_preset
from api.services.risup_parser import parse_risup

router = APIRouter(prefix="/api/integrate", tags=["integrate"])

_MAX_FILE_SIZE = 10 * 1024 * 1024   # 10 MB
_FORM_PART_SIZE = 50 * 1024 * 1024  # 50 MB (Starlette form() 제한 상향)


@router.post("/check")
async def check_conflicts(request: Request) -> JSONResponse:
    """
    기반 파일의 toggle 키 목록을 반환합니다.
    프론트엔드에서 충돌 감지에 사용합니다.
    """
    form = await request.form(max_part_size=_FORM_PART_SIZE)
    base_file = form.get("base_file")
    if not isinstance(base_file, UploadFile):
        raise HTTPException(status_code=400, detail="base_file 필드가 없습니다")
    if not base_file.filename or not base_file.filename.endswith(".risup"):
        raise HTTPException(status_code=400, detail=".risup 파일만 업로드 가능합니다")
    contents = await base_file.read()
    if len(contents) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="파일이 10MB를 초과합니다")
    try:
        preset = parse_risup(contents)
        features = extract_features(preset, base_file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return JSONResponse({"ok": True, "features": features})


@router.post("/build")
async def build_integrated(request: Request) -> Response:
    """
    기반 파일에 선택한 기능을 병합하여 새 .risup 파일을 반환합니다.

    form fields:
      base_file: .risup 파일
      payload:   JSON (Blob) — additions + conflict_resolutions
    """
    form = await request.form(max_part_size=_FORM_PART_SIZE)

    base_file = form.get("base_file")
    if not isinstance(base_file, UploadFile):
        raise HTTPException(status_code=400, detail="base_file 필드가 없습니다")
    if not base_file.filename or not base_file.filename.endswith(".risup"):
        raise HTTPException(status_code=400, detail=".risup 파일만 업로드 가능합니다")
    contents = await base_file.read()
    if len(contents) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="파일이 10MB를 초과합니다")

    payload_field = form.get("payload")
    try:
        if isinstance(payload_field, UploadFile):
            payload_bytes = await payload_field.read()
            data = json.loads(payload_bytes)
        elif isinstance(payload_field, str):
            data = json.loads(payload_field)
        else:
            raise HTTPException(status_code=400, detail="payload 필드가 없습니다")
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail="payload JSON 파싱 실패") from e

    try:
        base_preset = parse_risup(contents)
        merged = merge_preset(
            base_preset,
            data.get("additions", []),
            data.get("conflict_resolutions", {}),
            data.get("removals", []),
        )
        result_bytes = encode_risup(merged)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    out_filename = (base_file.filename or "merged").replace(".risup", "_merged.risup")
    encoded = quote(out_filename, safe="")
    return Response(
        content=result_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )
