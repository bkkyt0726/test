from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile

from api.services.feature_extractor import extract_features
from api.services.risup_analyzer import analyze
from api.services.risup_parser import parse_risup

router = APIRouter(prefix="/api/analyze", tags=["analyze"])

_MAX_FILE_SIZE = 10 * 1024 * 1024   # 10 MB
_FORM_PART_SIZE = 50 * 1024 * 1024  # 50 MB (Starlette form() 제한 상향)


def _validate_risup(filename: str | None) -> None:
    if not filename or not filename.endswith(".risup"):
        raise HTTPException(status_code=400, detail=f"{filename}: .risup 파일만 업로드 가능합니다")


@router.post("/risup")
async def analyze_risup(request: Request) -> JSONResponse:
    form = await request.form(max_part_size=_FORM_PART_SIZE)
    file = form.get("file")
    if not isinstance(file, UploadFile):
        raise HTTPException(status_code=400, detail="file 필드가 없습니다")
    _validate_risup(file.filename)
    contents = await file.read()
    if len(contents) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="파일 크기가 10MB를 초과합니다")
    try:
        preset = parse_risup(contents)
        result = analyze(preset)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return JSONResponse({"ok": True, "filename": file.filename, **result})


@router.post("/features")
async def extract_features_multi(request: Request) -> JSONResponse:
    """
    여러 .risup 파일을 업로드하면 파일별 기능(feature)을 추출해 반환합니다.
    """
    form = await request.form(max_part_size=_FORM_PART_SIZE)
    files = form.getlist("files")
    if not files:
        raise HTTPException(status_code=400, detail="파일을 하나 이상 업로드하세요")

    results = []
    for file in files:
        if not isinstance(file, UploadFile):
            raise HTTPException(status_code=400, detail="파일 형식 오류")
        _validate_risup(file.filename)
        contents = await file.read()
        if len(contents) > _MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"{file.filename}: 파일이 10MB를 초과합니다")
        try:
            preset = parse_risup(contents)
            features = extract_features(preset, file.filename or "")
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"{file.filename}: {e}") from e
        results.append(features)

    return JSONResponse({"ok": True, "files": results})
