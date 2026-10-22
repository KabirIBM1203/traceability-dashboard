"""
POST /api/tr-lookup

Accepts a multipart Excel upload whose columns must include "Request/Task".
Optional columns used when present: "Owner", "Short Description", "Workstream".

Two lookup methods feed every step:

  [Desc]    the uploaded Excel "Short Description"
  [RevTrac] TR -> EXPORT_TR row -> its Rev-Trac request -> that request's
            Ref Values in EXPORT_Reference (the TR's own short text is
            checked after the Ref Values)

Resolution order per TR - first hit wins, and a RITM always beats the rest:

  Phase 1 - RITM
    1. RITM found by [Desc]
    2. RITM found by [RevTrac]
    3. DCRTB / CMD / CTB found by [Desc], then [RevTrac]
       -> Databricks walks the story up to its DCRTB feature
       -> that feature's ServiceNow Id (RITM)

  Phase 2 - only once no RITM can be found
    4. CHG / INC / DMD0 / DBBT / PRICINGPRO / other JIRA keys,
       [Desc] first, then [RevTrac] (a key Databricks maps to a feature
       with a RITM is replaced by that RITM)
    5. A DCRTB feature reached in step 3 that has no ServiceNow Id
    6. S-number from [Desc]

One batched Databricks call serves the whole upload; every RITM that is
found is also enriched with status / OpCo / stream.

Response: one row per uploaded TR, in upload order, with
  tr, owner, short_description, workstream, ticket, ticket_source,
  feature_status, opco
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File

from app.api.features import db_service, revtrac_service
from app.services.revtrac_service import OTHER, RITM, SNUM, STORY, extract_tickets


router = APIRouter(
    prefix="/api/tr-lookup",
    tags=["TR Lookup"],
)

_executor = ThreadPoolExecutor(max_workers=2)

# Phase-2 types shown even when Databricks does not know them. Generic
# JIRA-style matches (e.g. "UTF-8") are only trusted if Databricks does.
_TRUSTED_OTHER_TYPES = {"CHG", "INC", "DMD0", "DBBT", "PRICINGPRO"}


def _candidates(row: dict, tier: str) -> list[tuple[str, str, str]]:
    """
    (ticket_type, value, source) of the given tier in lookup order:
    [Desc] first, then [RevTrac] (Ref Values, then the TR's short text).
    A value seen by an earlier method is not repeated.
    """
    groups = (
        ("excel_short_description", [row["short_description"]]),
        ("revtrac_ref_value",       row["_ref_values"]),
        ("transport_short_text",    [row["_tr_text"]]),
    )
    found: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for source, texts in groups:
        for t_type, value in extract_tickets(texts, tier):
            if value not in seen:
                seen.add(value)
                found.append((t_type, value, source))
    return found


def _enrich(row: dict, feature: dict) -> None:
    row["feature_status"] = feature.get("status")
    row["workstream"] = row["workstream"] or feature.get("stream")
    row["opco"] = feature.get("opco_impacted") or feature.get("requesting_opco")


def _set(row: dict, t_type: str, value: str, source: str) -> None:
    row.update(ticket_type=t_type, ticket=value, ticket_source=source)


def _resolve_all(items: list[dict]) -> list[dict]:
    rows = []
    for item in items:
        rt = revtrac_service.lookup_transport(item["tr"])
        rows.append({
            "tr":                item["tr"],
            "owner":             item["owner"],
            "short_description": item["short_desc"],
            "workstream":        item["workstream"],
            "ticket_type":       None,
            "ticket":            None,
            "ticket_source":     None,
            "feature_status":    None,
            "opco":              None,
            "_ref_values":       rt["ref_values"],
            "_tr_text":          rt["short_text"],
        })

    # Candidates per tier, and the tokens Databricks has to resolve.
    tokens: set[str] = set()
    for row in rows:
        row["_ritm"]  = _candidates(row, RITM)
        row["_story"] = _candidates(row, STORY)
        row["_other"] = _candidates(row, OTHER)
        for tier in ("_ritm", "_story", "_other"):
            tokens.update(v for _, v, _ in row[tier] if tier != "_other" or "-" in v)

    features = db_service.lookup_features_by_tokens(list(tokens))

    for row in rows:
        story_fallback = None   # (feature, source): DCRTB feature without RITM

        # ---- Phase 1: RITM ------------------------------------------------
        # 1 + 2. A RITM from [Desc], else from [RevTrac]
        if row["_ritm"]:
            _set(row, *row["_ritm"][0])
            feature = features.get(row["ticket"])
            if feature:
                _enrich(row, feature)

        # 3. Stories -> parent DCRTB feature -> its RITM
        else:
            for _, value, source in row["_story"]:
                feature = features.get(value)
                if not feature:
                    continue
                if feature.get("ritm"):
                    _set(row, "RITM", feature["ritm"], "databricks_parent_feature")
                    _enrich(row, feature)
                    break
                if story_fallback is None:
                    story_fallback = (feature, value)

        # ---- Phase 2: no RITM could be found --------------------------------
        # 4. CHG / INC / DMD0 / DBBT / PRICINGPRO / other keys
        #    First any key Databricks can turn into a RITM, then the first
        #    trusted key as-is.
        if not row["ticket"]:
            for _, value, _ in row["_other"]:
                feature = features.get(value) if "-" in value else None
                if feature and feature.get("ritm"):
                    _set(row, "RITM", feature["ritm"], "databricks_extra_key")
                    _enrich(row, feature)
                    break
        if not row["ticket"]:
            for t_type, value, source in row["_other"]:
                if t_type in _TRUSTED_OTHER_TYPES:
                    _set(row, t_type, value, source)
                    break

        # 5. DCRTB feature without a ServiceNow Id
        if not row["ticket"] and story_fallback:
            feature, value = story_fallback
            _set(row, "DCRTB", feature["issue_key"], "databricks_parent_feature")
            _enrich(row, feature)

        # 6. Weak S-number from the uploaded description
        if not row["ticket"]:
            found = extract_tickets([row["short_description"]], SNUM)
            if found:
                _set(row, *found[0], "excel_short_description")

    output = []
    for row in rows:
        t_type = row.pop("ticket_type")
        for key in ("_ref_values", "_tr_text", "_ritm", "_story", "_other"):
            row.pop(key)
        if t_type and row["ticket"]:
            row["ticket"] = f"{t_type}: {row['ticket']}"
        output.append(row)

    return output

@router.post("")
async def tr_lookup(file: UploadFile = File(...)):
    """
    Upload an Excel file with at minimum a 'Request/Task' column.
    Returns one resolved row per TR (7 display fields + ticket_source).
    """
    content = await file.read()

    try:
        df = pd.read_excel(BytesIO(content))
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not parse Excel file: {exc}"
        )

    if "Request/Task" not in df.columns:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Column 'Request/Task' not found. "
                f"Available columns: {list(df.columns)}"
            ),
        )

    col = {str(c).strip().lower(): c for c in df.columns}

    def _get(row, *candidates):
        for c in candidates:
            if c in col:
                val = row.get(col[c])
                if pd.notna(val) and str(val).strip():
                    return str(val).strip()
        return None

    items = []
    for _, row in df.iterrows():
        tr = _get(row, "request/task")
        if not tr:
            continue
        items.append({
            "tr":         tr,
            "owner":      _get(row, "owner"),
            "short_desc": _get(row, "short description", "short_description"),
            "workstream": _get(row, "workstream", "work stream", "stream"),
        })

    if not items:
        raise HTTPException(
            status_code=422,
            detail="No TR values found in 'Request/Task' column."
        )

    loop = asyncio.get_running_loop()

    try:
        return await loop.run_in_executor(_executor, _resolve_all, items)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"TR lookup failed: {exc}"
        )
