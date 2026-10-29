"""
/api/revtrac - upload and status for the two RevTrac exports.

GET  /api/revtrac/status   which files are loaded + the delta of the last upload
POST /api/revtrac/upload   multipart: `reference` (RevTrac references) and/or
                           `transports` (TR list). Either or both may be sent.

An upload is validated first (nothing is stored if a file is invalid), compared
against the data currently stored, then persisted and swapped in. The response
is the delta: new / removed RevTrac requests, status changes, added / removed
transports and the tickets (RITM / JIRA keys) whose traceability moved.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.auth import require_login
from app.services import data_store
from app.services.registry import revtrac_service
from app.services.revtrac_service import RevTracService


router = APIRouter(
    prefix="/api/revtrac",
    tags=["RevTrac"],
    dependencies=[Depends(require_login)],
)

_executor = ThreadPoolExecutor(max_workers=1)


def _status() -> dict:
    state = data_store.load_state()
    return {
        "loaded": revtrac_service.has_data,
        "reference": state.get("reference"),
        "transports": state.get("transports"),
        "last_delta": state.get("last_delta"),
    }


@router.get("/status")
def status():
    return _status()


def _apply_upload(
    reference: tuple[str, bytes] | None,
    transports: tuple[str, bytes] | None,
) -> dict:
    # 1. Parse + validate everything BEFORE touching what is stored
    try:
        new_ref = (
            RevTracService.parse_reference(BytesIO(reference[1]))
            if reference else None
        )
        new_tr = (
            RevTracService.parse_transports(BytesIO(transports[1]))
            if transports else None
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Could not read Excel file: {exc}"
        ) from exc

    old_ref, old_tr = revtrac_service.reference_df, revtrac_service.transport_df

    # 2. Delta of the new data against the currently stored data
    ref_after = new_ref if new_ref is not None else old_ref
    tr_after = new_tr if new_tr is not None else old_tr
    updated = [
        label for label, f in (("reference", reference), ("transports", transports)) if f
    ]
    delta = data_store.compute_delta(old_ref, ref_after, old_tr, tr_after, updated)

    # 3. Persist the files + delta, then swap the new data into memory
    if reference:
        data_store.save_upload("reference", reference[0], reference[1], len(new_ref))
    if transports:
        data_store.save_upload("transports", transports[0], transports[1], len(new_tr))
    data_store.save_delta(delta)

    revtrac_service.replace(
        new_ref if new_ref is not None else old_ref,
        new_tr if new_tr is not None else old_tr,
    )
    return delta


@router.post("/upload")
async def upload(
    reference: UploadFile | None = File(None),
    transports: UploadFile | None = File(None),
):
    if reference is None and transports is None:
        raise HTTPException(
            status_code=422,
            detail="Send at least one file: 'reference' and/or 'transports'.",
        )

    ref_file = (reference.filename or "reference.xlsx", await reference.read()) if reference else None
    tr_file = (transports.filename or "transports.xlsx", await transports.read()) if transports else None

    loop = asyncio.get_event_loop()
    delta = await loop.run_in_executor(_executor, _apply_upload, ref_file, tr_file)
    return {**_status(), "last_delta": delta}
