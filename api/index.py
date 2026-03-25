import os
import sys

# Vercel은 api/ 디렉토리를 sys.path에 추가하므로
# 프로젝트 루트(api/의 부모)를 명시적으로 추가해야
# from api.routers import ... 가 정상 동작함
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import analyze, integrate

app = FastAPI()

_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(integrate.router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
