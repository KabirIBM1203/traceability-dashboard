from fastapi import FastAPI

from app.api.features import router as features_router


app = FastAPI(title="Traceability Dashboard API")


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