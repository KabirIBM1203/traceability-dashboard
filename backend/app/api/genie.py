"""
/api/genie — two endpoints for the AI panel.

POST /api/genie/ask
    Body: { "question": "..." }
    Starts a new Genie conversation and returns the answer
    together with the conversation_id so the frontend can
    send follow-up messages without losing context.

POST /api/genie/followup
    Body: { "conversation_id": "...", "question": "..." }
    Continues an existing conversation.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.genie_service import GenieService
from app.core.config import GENIE_SPACE_ID


router = APIRouter(
    prefix="/api/genie",
    tags=["Genie AI"],
)

_genie = GenieService()
_executor = ThreadPoolExecutor(max_workers=4)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str


class FollowupRequest(BaseModel):
    conversation_id: str
    question: str


class GenieResponse(BaseModel):
    conversation_id: str | None
    message_id: str | None
    answer: str


# ---------------------------------------------------------------------------
# Guard: reject early if GENIE_SPACE_ID is not configured
# ---------------------------------------------------------------------------

def _assert_configured():
    if not GENIE_SPACE_ID:
        raise HTTPException(
            status_code=503,
            detail="GENIE_SPACE_ID is not configured on the server.",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/ask", response_model=GenieResponse)
async def ask(body: AskRequest):
    """Start a new Genie conversation."""

    _assert_configured()

    if not body.question.strip():
        raise HTTPException(status_code=422, detail="question must not be empty.")

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _executor,
            lambda: _genie.ask(body.question.strip()),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Genie request failed: {exc}",
        ) from exc

    return result


@router.post("/followup", response_model=GenieResponse)
async def followup(body: FollowupRequest):
    """Continue an existing Genie conversation."""

    _assert_configured()

    if not body.question.strip():
        raise HTTPException(status_code=422, detail="question must not be empty.")

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _executor,
            lambda: _genie.followup(
                body.conversation_id,
                body.question.strip(),
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Genie follow-up failed: {exc}",
        ) from exc

    return result
