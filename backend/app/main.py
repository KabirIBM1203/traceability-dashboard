from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth      import router as auth_router
from app.api.revtrac   import router as revtrac_router
from app.services.databricks_service import DatabricksNotConnected
from app.api.features  import router as features_router
from app.api.genie     import router as genie_router
from app.api.tr_lookup import router as tr_lookup_router
from app.api.defects   import router as defects_router


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


@app.exception_handler(DatabricksNotConnected)
async def not_connected_handler(request: Request, exc: DatabricksNotConnected):
    return JSONResponse(status_code=401, content={"detail": str(exc)})


app.include_router(auth_router)
app.include_router(revtrac_router)
app.include_router(features_router)
app.include_router(genie_router)
app.include_router(tr_lookup_router)
app.include_router(defects_router)


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