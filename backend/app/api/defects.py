"""
/api/defects — list and detail endpoints for GSIT (DBBT) and LSIT (DMD0) defects.

GET  /api/defects?project=DBBT   → list all DBBT defects
GET  /api/defects?project=DMD0   → list all DMD0 defects
GET  /api/defects/{issue_key}    → single defect with RevTrac + attachments

RevTrac matching strategy for defects:
  The defect's own issue key (e.g. DBBT-5962 / DMD0-339) appears directly
  in the RevTrac Reference export as a Ref Value (SNOW_CR type).
  The RITM (ServiceNow Id) is also used as a secondary lookup.
  Any direct child issues are passed in as linked keys so that sub-tasks
  whose short text references the parent defect are also captured.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.feature import Feature
from app.api.auth import require_login
from app.services.registry import db_service as _db_service
from app.services.registry import revtrac_service as _revtrac_service


router = APIRouter(
    prefix="/api/defects",
    tags=["Defects"],
    dependencies=[Depends(require_login)],
)

_executor = ThreadPoolExecutor(max_workers=8)

# Allowed project keys for the list endpoint
_ALLOWED_PROJECTS = {"DBBT", "DMD0"}


@router.get("", response_model=list[Feature])
def get_defects(project: str = Query(..., description="JIRA project key: DBBT or DMD0")):
    """
    Return all defects for a given JIRA project (DBBT = GSIT, DMD0 = LSIT).
    """
    key = project.upper()
    if key not in _ALLOWED_PROJECTS:
        raise HTTPException(
            status_code=400,
            detail=f"project must be one of: {', '.join(sorted(_ALLOWED_PROJECTS))}",
        )
    return _db_service.get_defects(key)


@router.get("/{issue_key}")
async def get_defect(issue_key: str):
    """
    Return a single defect with its RevTrac and transport details.

    RevTrac lookup uses:
      1. The defect's own issue key  (e.g. DBBT-5962) — appears directly in
         RevTrac Ref Value as a SNOW_CR reference
      2. The RITM (ServiceNow Id)    — secondary lookup
      3. Any direct child issue keys — catches sub-tasks whose TR short text
         mentions the parent defect key
    """
    loop = asyncio.get_event_loop()

    # Step 1: fetch the defect row
    defect = await loop.run_in_executor(
        _executor, _db_service.get_defect, issue_key
    )

    if defect is None:
        raise HTTPException(
            status_code=404,
            detail=f"Defect {issue_key} not found",
        )

    ritm = defect.get("ritm")

    # Step 2: fire child-keys, attachments, qtest in parallel
    child_keys_future = loop.run_in_executor(
        _executor, _db_service.get_defect_child_issue_keys, issue_key
    )
    attachments_future = loop.run_in_executor(
        _executor, _db_service.get_feature_attachments, issue_key
    )
    qtest_future = loop.run_in_executor(
        _executor, _db_service.get_qtest_links, issue_key
    )

    child_issue_keys = await child_keys_future

    revtrac_future = loop.run_in_executor(
        _executor,
        lambda: _revtrac_service.get_revtrac_for_feature(
            issue_key=issue_key,
            ritm=ritm,
            linked_issue_keys=child_issue_keys,
        ),
    )

    revtrac_data, release_artifacts, qtest_links = await asyncio.gather(
        revtrac_future,
        attachments_future,
        qtest_future,
    )

    defect["revtrac"] = revtrac_data
    defect["release_artifacts"] = release_artifacts
    defect["qtest_links"] = qtest_links

    return defect
