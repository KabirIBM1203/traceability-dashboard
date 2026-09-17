import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException

from app.models.feature import Feature
from app.services.databricks_service import DatabricksService
from app.services.revtrac_service import RevTracService


router = APIRouter(
    prefix="/api/features",
    tags=["Features"]
)


db_service = DatabricksService()
revtrac_service = RevTracService()

# Single shared thread pool for all blocking DB / file-IO calls.
_executor = ThreadPoolExecutor(max_workers=8)


@router.get("", response_model=list[Feature])
def get_features():
    """
    Return all DCRTB features from Databricks.
    """

    return db_service.get_features()


@router.get("/{issue_key}")
async def get_feature(issue_key: str):
    """
    Return a single DCRTB feature together with
    its RevTrac and transport details.

    The three independent data-fetches (child keys, RevTrac lookup,
    and attachments) are dispatched concurrently so total latency is
    bounded by the slowest single call rather than the sum of all.
    """

    loop = asyncio.get_event_loop()

    # ── Step 1: fetch the feature row (needed for ritm before RevTrac) ──
    feature = await loop.run_in_executor(
        _executor, db_service.get_feature, issue_key
    )

    if feature is None:
        raise HTTPException(
            status_code=404,
            detail=f"Feature {issue_key} not found"
        )

    ritm = feature.get("ritm")

    # ── Step 2: fire child-keys, RevTrac, and attachments in parallel ──
    child_keys_future = loop.run_in_executor(
        _executor, db_service.get_feature_child_issue_keys, issue_key
    )
    attachments_future = loop.run_in_executor(
        _executor, db_service.get_feature_attachments, issue_key
    )

    # Child keys must be known before the RevTrac call, but we can
    # overlap attachments with both while waiting.
    child_issue_keys = await child_keys_future

    revtrac_future = loop.run_in_executor(
        _executor,
        lambda: revtrac_service.get_revtrac_for_feature(
            issue_key=issue_key,
            ritm=ritm,
            linked_issue_keys=child_issue_keys,
        ),
    )

    revtrac_data, release_artifacts = await asyncio.gather(
        revtrac_future,
        attachments_future,
    )

    feature["revtrac"] = revtrac_data
    feature["release_artifacts"] = release_artifacts

    return feature