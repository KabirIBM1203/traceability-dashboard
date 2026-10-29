"""
Persistent store for the uploaded RevTrac exports.

<repo>/data/store/
    revtrac_reference.xlsx    latest "RevTrac references" upload
    revtrac_transports.xlsx   latest "TR list" upload
    state.json                file metadata + the delta of the last upload

Everything the dashboard shows from RevTrac is read from these files, so the
previous upload's results are available again every time the app starts.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

STORE_DIR = Path(__file__).resolve().parents[3] / "data" / "store"
REFERENCE_FILE = STORE_DIR / "revtrac_reference.xlsx"
TRANSPORT_FILE = STORE_DIR / "revtrac_transports.xlsx"
STATE_FILE = STORE_DIR / "state.json"

# Max items listed per category in the stored delta report (counts stay exact)
_LIST_CAP = 100
_TICKET_CAP = 500

# RITM numbers and JIRA-style keys (DCRTB-12, DBBT-5962, CMD-17118, ...)
_TICKET_RE = re.compile(r"^(RITM\d+|[A-Z][A-Z0-9]{1,14}-\d+)$")


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"reference": None, "transports": None, "last_delta": None}


def _write_state(state: dict) -> None:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=1), encoding="utf-8")


def save_upload(
    kind: str, filename: str, content: bytes, rows: int, delta: dict | None = None
) -> None:
    """Persist one uploaded file ('reference' | 'transports') and its metadata."""
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    target = REFERENCE_FILE if kind == "reference" else TRANSPORT_FILE
    target.write_bytes(content)

    state = load_state()
    state[kind] = {"filename": filename, "uploaded_at": _now(), "rows": rows}
    if delta is not None:
        state["last_delta"] = delta
    _write_state(state)


def save_delta(delta: dict) -> None:
    state = load_state()
    state["last_delta"] = delta
    _write_state(state)


# ---------------------------------------------------------------------------
# Delta between the stored data and a new upload
# ---------------------------------------------------------------------------

def _key(value):
    return int(value) if pd.notna(value) else None


def _s(value) -> str:
    return "" if value is None or pd.isna(value) else str(value)


def _first_by_request(df: pd.DataFrame, column: str) -> dict:
    out: dict = {}
    for req, value in zip(df["_revtrac_key"], df[column]):
        k = _key(req)
        if k is not None and k not in out:
            out[k] = _s(value)
    return out


def _ref_rows(df: pd.DataFrame) -> set:
    return {
        (_key(r), _s(t), v)
        for r, t, v in zip(df["_revtrac_key"], df["Ref Type"], df["Ref Value"])
    }


def _transport_rows(df: pd.DataFrame) -> dict:
    out: dict = {}
    for r, n, text in zip(
        df["_revtrac_key"], df["Transport number"], df["Short text"]
    ):
        number = _s(n).strip().upper()
        if number:
            out.setdefault((_key(r), number), _s(text))
    return out


def compute_delta(
    old_ref: pd.DataFrame,
    new_ref: pd.DataFrame,
    old_tr: pd.DataFrame,
    new_tr: pd.DataFrame,
    updated: list[str],
) -> dict:
    """What changed between the stored RevTrac data and the new upload."""

    initial = old_ref.empty and old_tr.empty

    old_status, new_status = (
        _first_by_request(old_ref, "Status"),
        _first_by_request(new_ref, "Status"),
    )
    old_title, new_title = (
        _first_by_request(old_ref, "Title"),
        _first_by_request(new_ref, "Title"),
    )

    new_requests = sorted(set(new_status) - set(old_status))
    removed_requests = sorted(set(old_status) - set(new_status))
    status_changes = [
        (k, old_status[k], new_status[k])
        for k in sorted(set(old_status) & set(new_status))
        if old_status[k] != new_status[k]
    ]

    old_rows, new_rows = _ref_rows(old_ref), _ref_rows(new_ref)
    ref_added, ref_removed = new_rows - old_rows, old_rows - new_rows

    old_trs, new_trs = _transport_rows(old_tr), _transport_rows(new_tr)
    tr_added = sorted(set(new_trs) - set(old_trs), key=lambda x: (x[0] or 0, x[1]))
    tr_removed = sorted(set(old_trs) - set(new_trs), key=lambda x: (x[0] or 0, x[1]))

    # Requests touched by any change -> the tickets (RITM / JIRA keys) they
    # reference are the ones whose traceability just moved.
    touched = set(new_requests) | set(removed_requests)
    touched |= {k for k, _, _ in status_changes}
    touched |= {k for k, _, _ in ref_added} | {k for k, _, _ in ref_removed}
    touched |= {k for k, _ in tr_added} | {k for k, _ in tr_removed}
    touched.discard(None)

    affected: set[str] = set()
    if not initial:
        for df in (old_ref, new_ref):
            for req, value in zip(df["_revtrac_key"], df["Ref Value"]):
                if _key(req) in touched and _TICKET_RE.match(value):
                    affected.add(value)

    summary = {
        "requests_added": len(new_requests),
        "requests_removed": len(removed_requests),
        "status_changes": len(status_changes),
        "reference_rows_added": len(ref_added),
        "reference_rows_removed": len(ref_removed),
        "transports_added": len(tr_added),
        "transports_removed": len(tr_removed),
        "affected_tickets": len(affected),
        "reference_rows_total": int(len(new_ref)),
        "transport_rows_total": int(len(new_tr)),
    }

    delta = {
        "applied_at": _now(),
        "updated": updated,
        "initial": initial,
        "summary": summary,
        "new_requests": [],
        "removed_requests": [],
        "status_changes": [],
        "transports_added": [],
        "transports_removed": [],
        "affected_tickets": [],
    }

    if initial:
        return delta   # first load: counts only, listing everything is noise

    delta["new_requests"] = [
        {"revtrac": k, "title": new_title.get(k, ""), "status": new_status[k]}
        for k in new_requests[:_LIST_CAP]
    ]
    delta["removed_requests"] = [
        {"revtrac": k, "title": old_title.get(k, ""), "status": old_status[k]}
        for k in removed_requests[:_LIST_CAP]
    ]
    delta["status_changes"] = [
        {"revtrac": k, "title": new_title.get(k, ""), "from": a, "to": b}
        for k, a, b in status_changes[:_LIST_CAP]
    ]
    delta["transports_added"] = [
        {"revtrac": k, "transport": n, "short_text": new_trs[(k, n)]}
        for k, n in tr_added[:_LIST_CAP]
    ]
    delta["transports_removed"] = [
        {"revtrac": k, "transport": n, "short_text": old_trs[(k, n)]}
        for k, n in tr_removed[:_LIST_CAP]
    ]
    delta["affected_tickets"] = sorted(affected)[:_TICKET_CAP]
    return delta
