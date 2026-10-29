"""
/api/auth - the Databricks login gate shown as the app's first page.

GET  /api/auth/status   {"connected": bool, "configured": bool}
POST /api/auth/login    opens the Databricks OAuth (Microsoft Entra ID) browser
                        sign-in on the machine running this backend, then
                        keeps the connection for all later requests.

Every JIRA/RevTrac data router depends on require_login() so nothing is
served before the user has signed in.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException

from app.core.config import HTTP_PATH, SERVER_HOSTNAME
from app.services.registry import db_service


router = APIRouter(prefix="/api/auth", tags=["Auth"])

_executor = ThreadPoolExecutor(max_workers=1)


def require_login() -> None:
    if not db_service.is_connected:
        raise HTTPException(
            status_code=401, detail="Databricks login required"
        )


@router.get("/status")
def status():
    return {
        "connected": db_service.is_connected,
        "configured": bool(SERVER_HOSTNAME and HTTP_PATH),
    }


@router.post("/login")
async def login():
    if not (SERVER_HOSTNAME and HTTP_PATH):
        raise HTTPException(
            status_code=503,
            detail=(
                "Databricks is not configured. Set DATABRICKS_SERVER_HOSTNAME "
                "and DATABRICKS_HTTP_PATH in backend/.env."
            ),
        )

    loop = asyncio.get_event_loop()
    try:
        # Blocks until the user finishes the browser sign-in
        await loop.run_in_executor(_executor, db_service.connect)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Databricks sign-in failed: {exc}"
        ) from exc

    return {"connected": True}
