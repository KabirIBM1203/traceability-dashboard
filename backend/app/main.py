from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.features import router as features_router


app = FastAPI(
    title="Traceability Dashboard API"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(features_router)


@app.get("/")
def root():
    return {
        "application": "Traceability Dashboard API"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }