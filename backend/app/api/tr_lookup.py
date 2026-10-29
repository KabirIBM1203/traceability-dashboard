"""
POST /api/tr-lookup

Accepts a multipart Excel upload whose columns must include "Request/Task".
Optional columns used when present: "Owner", "Short Description", "Workstream".

Two lookup methods feed every step:

  [Desc]    the uploaded Excel "Short Description"
  [RevTrac] TR -> EXPORT_TR row -> its Rev-Trac request -> that request's
            Ref Values in EXPORT_Reference (the TR's own short text is
            checked after the Ref Values)

Resolution order per TR — first hit wins, RITM always beats everything else:

  Phase 1 — RITM
    1. RITM found directly in [Desc] or [RevTrac]
    2. STORY key (DCRTB / CMD / CTB / CD1) found in [Desc] or [RevTrac]
       → Databricks walks the parent chain (any project) → its RITM

  Phase 2 — once no RITM found via Phase 1
    3. OTHER key (CHG / INC / DMD0 / DBBT / PRICINGPRO / ASAPIO / DRC /
       PHOENIX / ESSRM / generic JIRA) found in [Desc] or [RevTrac]
       → if Databricks can resolve it to a RITM, use that
    4. First trusted OTHER key shown as-is with whatever enrichment
       Databricks can provide (status / opco)

  Phase 3 — exhaustive fallback, only if still unresolved
    5. Re-scan [Desc] then [RevTrac] for ANY recognisable key not yet tried
       and query Databricks one more time.  Prefer keys that Databricks
       resolves to a RITM; otherwise surface the best key found.

  Phase 4 — last resort
    6. S-number from [Desc]

One batched Databricks call covers Phases 1+2+3; every resolved ticket is
enriched with status / stream / OpCo from JIRA.

Response: one row per uploaded TR, in upload order, with
  tr, owner, short_description, workstream, ticket, ticket_source,
  feature_status, opco
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.api.auth import require_login
from app.services.registry import db_service, revtrac_service
from app.services.revtrac_service import OTHER, RITM, SNUM, STORY, extract_tickets


router = APIRouter(
    prefix="/api/tr-lookup",
    tags=["TR Lookup"],
    dependencies=[Depends(require_login)],
)

_executor = ThreadPoolExecutor(max_workers=2)

# Trusted OTHER types: shown as-is even when Databricks doesn't know them.
# Generic JIRA-style matches (e.g. "UTF-8") are only surfaced if Databricks
# confirms them.
_TRUSTED_OTHER_TYPES = {
    "CHG", "INC", "DMD0", "DBBT", "PRICINGPRO",
    "ASAPIO", "DRC", "PHOENIX", "ESSRM",
}

# These types are authoritative when found directly in RevTrac ref values —
# they beat any RITM found in the short description text.
_REVTRAC_AUTHORITATIVE = {"CHG", "INC"}


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


def _all_candidates(row: dict) -> list[tuple[str, str, str]]:
    """
    All (ticket_type, value, source) across ALL tiers in priority order,
    deduplicated. Used for Phase 3 exhaustive re-scan.
    """
    seen: set[str] = set()
    result: list[tuple[str, str, str]] = []
    for tier in (RITM, STORY, OTHER):
        for t_type, value, source in _candidates(row, tier):
            if value not in seen:
                seen.add(value)
                result.append((t_type, value, source))
    return result


def _enrich(row: dict, feature: dict) -> None:
    row["feature_status"] = feature.get("status")
    row["workstream"] = row["workstream"] or feature.get("stream")
    # SQL now returns a single 'opco' column (COALESCE of all variants)
    row["opco"] = (
        feature.get("opco")
        or feature.get("opco_impacted")
        or feature.get("requesting_opco")
    )


def _set(row: dict, t_type: str, value: str, source: str) -> None:
    row.update(ticket_type=t_type, ticket=value, ticket_source=source)


def _type_from_value(value: str) -> str:
    """
    Derive the correct ticket type from the value itself.
    The 'ServiceNow Id' JIRA field can hold CHG/INC numbers as well as RITMs,
    so we must not blindly label them all 'RITM'.
    """
    v = value.upper()
    if v.startswith("CHG"):
        return "CHG"
    if v.startswith("INC"):
        return "INC"
    return "RITM"


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

    # ---- Build candidate lists and collect all tokens for Databricks --------
    tokens: set[str] = set()
    for row in rows:
        row["_ritm"]  = _candidates(row, RITM)
        row["_story"] = _candidates(row, STORY)
        row["_other"] = _candidates(row, OTHER)
        # RITM/STORY always sent; OTHER sent if JIRA-style (has hyphen) OR trusted
        # (CHG/INC have no hyphen but still need Databricks for OpCo enrichment)
        for tier in ("_ritm", "_story"):
            tokens.update(v for _, v, _ in row[tier])
        for t_type, v, _ in row["_other"]:
            if "-" in v or t_type in _TRUSTED_OTHER_TYPES:
                tokens.add(v)

    features = db_service.lookup_features_by_tokens(list(tokens))

    for row in rows:
        story_fallback = None   # (feature, source): feature found but no RITM

        # ==============================================================
        # Pre-Phase — CHG/INC in RevTrac ref values beats everything.
        # If the transport is directly linked to a change/incident record
        # in RevTrac, surface it as CHG/INC regardless of any RITM that
        # might appear in the uploaded description text.
        # ==============================================================
        revtrac_authoritative = None
        for t_type, value, source in _candidates(row, OTHER):
            if t_type in _REVTRAC_AUTHORITATIVE and source in (
                "revtrac_ref_value", "transport_short_text"
            ):
                revtrac_authoritative = (t_type, value, source)
                break

        if revtrac_authoritative:
            _set(row, *revtrac_authoritative)
            # CHG/INC have no hyphen but are now in the token set — look them up directly
            feature = features.get(revtrac_authoritative[1].upper())
            if feature:
                _enrich(row, feature)

        # ==============================================================
        # Phase 1 — RITM
        # ==============================================================

        # 1. Direct RITM in [Desc] or [RevTrac]
        if not row["ticket"] and row["_ritm"]:
            _set(row, *row["_ritm"][0])
            feature = features.get(row["ticket"])
            if feature:
                _enrich(row, feature)

        # 2. STORY key → parent chain → RITM  (DCRTB, CMD, CTB, CD1, ...)
        elif not row["ticket"]:
            for _, value, source in row["_story"]:
                feature = features.get(value)
                if not feature:
                    continue
                if feature.get("ritm"):
                    ritm_val = feature["ritm"]
                    _set(row, _type_from_value(ritm_val), ritm_val, "databricks_parent_feature")
                    _enrich(row, feature)
                    break
                if story_fallback is None:
                    story_fallback = (feature, source)

        # ==============================================================
        # Phase 2 — OTHER keys
        # ==============================================================

        # 3. OTHER key that Databricks can promote to a RITM
        if not row["ticket"]:
            for t_type, value, _ in row["_other"]:
                in_db = "-" in value or t_type in _TRUSTED_OTHER_TYPES
                feature = features.get(value.upper()) if in_db else None
                if feature and feature.get("ritm"):
                    ritm_val = feature["ritm"]
                    _set(row, _type_from_value(ritm_val), ritm_val, "databricks_extra_key")
                    _enrich(row, feature)
                    break

        # 4. First trusted OTHER key as-is, enriched if Databricks knows it
        if not row["ticket"]:
            for t_type, value, source in row["_other"]:
                if t_type in _TRUSTED_OTHER_TYPES:
                    _set(row, t_type, value, source)
                    in_db = "-" in value or t_type in _TRUSTED_OTHER_TYPES
                    feature = features.get(value.upper()) if in_db else None
                    if feature:
                        _enrich(row, feature)
                    break

        # ==============================================================
        # Phase 3 — exhaustive re-scan across ALL tiers
        # Re-check every key we extracted (RITM/STORY/OTHER) against
        # the Databricks results.  This catches cases where e.g. a
        # DRC-123 key wasn't tried earlier because it fell below a
        # trusted-but-unresolvable key.
        # ==============================================================
        if not row["ticket"]:
            all_cands = _all_candidates(row)
            # 3a. Any candidate Databricks can resolve to a RITM
            for t_type, value, _ in all_cands:
                in_db = "-" in value or t_type in _TRUSTED_OTHER_TYPES
                feature = features.get(value.upper()) if in_db else None
                if feature and feature.get("ritm"):
                    ritm_val = feature["ritm"]
                    _set(row, _type_from_value(ritm_val), ritm_val, "databricks_exhaustive")
                    _enrich(row, feature)
                    break
            # 3b. Any candidate Databricks knows (even without a RITM)
            if not row["ticket"]:
                for t_type, value, source in all_cands:
                    in_db = "-" in value or t_type in _TRUSTED_OTHER_TYPES
                    feature = features.get(value.upper()) if in_db else None
                    if feature:
                        _set(row, t_type or feature.get("project_key", "JIRA"),
                             value, f"{source}_exhaustive")
                        _enrich(row, feature)
                        break
            # 3c. Any trusted OTHER key not yet surfaced
            if not row["ticket"]:
                for t_type, value, source in all_cands:
                    if t_type in _TRUSTED_OTHER_TYPES:
                        _set(row, t_type, value, f"{source}_exhaustive")
                        break

        # ==============================================================
        # Phase 2 continued — story fallback (feature exists, no RITM)
        # ==============================================================
        if not row["ticket"] and story_fallback:
            feature, source = story_fallback
            _set(row, feature.get("project_key", "DCRTB"),
                 feature["issue_key"], "databricks_parent_feature")
            _enrich(row, feature)

        # ==============================================================
        # Phase 4 — S-number last resort
        # ==============================================================
        if not row["ticket"]:
            found = extract_tickets([row["short_description"]], SNUM)
            if found:
                _set(row, *found[0], "excel_short_description")

    # ==============================================================
    # OpCo fallback pass — for every resolved row still missing an
    # OpCo, look up the matched JIRA issue key directly using
    # get_feature() / get_defect() (the proven single-issue queries).
    # Deduplicated so each unique issue key is fetched at most once.
    # ==============================================================
    opco_missing = [row for row in rows if row["ticket"] and not row["opco"]]
    if opco_missing:
        # Map each row to its JIRA issue key and build a deduplicated cache
        opco_cache: dict[str, str | None] = {}
        for row in opco_missing:
            ticket_val = row["ticket"]
            feature = features.get(ticket_val.upper()) if ticket_val else None
            issue_key = feature.get("issue_key") if feature else None
            if not issue_key and ticket_val and "-" in ticket_val:
                issue_key = ticket_val.upper()
            row["_fallback_key"] = issue_key
            if issue_key and issue_key not in opco_cache:
                opco_cache[issue_key] = None  # placeholder

        # Fetch opco for each unique issue key (get_feature covers DCRTB;
        # get_defect covers DBBT/DMD0 and any other project)
        for issue_key in list(opco_cache):
            detail = db_service.get_feature(issue_key)
            opco_val = detail.get("opco") if detail else None
            if not opco_val:
                detail = db_service.get_defect(issue_key)
                opco_val = detail.get("opco") if detail else None
            opco_cache[issue_key] = opco_val

        for row in opco_missing:
            fk = row.pop("_fallback_key", None)
            if fk and not row["opco"]:
                row["opco"] = opco_cache.get(fk)

    output = []
    for row in rows:
        t_type = row.pop("ticket_type")
        for key in ("_ref_values", "_tr_text", "_ritm", "_story", "_other", "_fallback_key"):
            row.pop(key, None)
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
