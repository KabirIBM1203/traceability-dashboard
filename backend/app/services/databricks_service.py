import re
import threading
from pathlib import Path

from databricks import sql

from app.core.config import SERVER_HOSTNAME, HTTP_PATH


class DatabricksNotConnected(Exception):
    """Raised by data calls made before the user signed in to Databricks."""


# ---------------------------------------------------------------------------
# Release-artifact detection patterns
# Each artifact type carries a list of regex patterns matched case-insensitively
# against the attachment filename (or label).  A match on ANY pattern is enough.
# ---------------------------------------------------------------------------

# Word-boundary helper: matches `word` when preceded and followed by a
# non-alphanumeric character (or start/end of string).  This handles
# filenames where words are delimited by underscores or hyphens as well
# as real whitespace.
def _wb(word: str) -> str:
    return rf"(?<![A-Za-z0-9]){word}(?![A-Za-z0-9])"


ARTIFACT_PATTERNS: dict[str, list[str]] = {
    "tr_bundle": [
        _wb("tr"),                    # standalone "TR"
        r"tr[\s_\-]?bundle",
        r"transport[\s_\-]?bundle",
    ],
    "uat_sign_off": [
        _wb("uat"),                   # standalone "UAT"
        r"uat[\s_\-]?sign",
        r"uat[\s_\-]?approval",
    ],
    "fut_ut": [
        _wb("fut"),                   # standalone "FUT"
        _wb("ut"),                    # standalone "UT"
        r"unit[\s_\-]?test",
        r"functional[\s_\-]?unit[\s_\-]?test",
    ],
    "release_notes": [
        r"release[\s_\-]?note",
        r"relnote",
        r"(?<![A-Za-z0-9])rn[\s_\-]?\d",  # e.g. "RN_1.0"
    ],
}


def _classify_attachment(filename: str | None, label: str | None) -> list[str]:
    """Return the artifact type keys matched by this attachment's filename/label."""
    text = " ".join(filter(None, [filename, label])).lower()
    matched = []
    for artifact_type, patterns in ARTIFACT_PATTERNS.items():
        if any(re.search(pat, text, re.IGNORECASE) for pat in patterns):
            matched.append(artifact_type)
    return matched


class DatabricksService:

    def __init__(self):
        # Nothing connects at import/startup. The user signs in from the
        # login page, which calls connect(); the connection is then reused
        # for every request (the OAuth browser popup happens only once).
        self._connection = None
        self._lock = threading.Lock()

    @property
    def is_connected(self) -> bool:
        return self._connection is not None

    def connect(self):
        """Open the Databricks connection (OAuth browser sign-in). Idempotent."""
        with self._lock:
            if self._connection is None:
                if not SERVER_HOSTNAME or not HTTP_PATH:
                    raise ValueError(
                        "DATABRICKS_SERVER_HOSTNAME and DATABRICKS_HTTP_PATH "
                        "must be set in backend/.env"
                    )
                self._connection = sql.connect(
                    server_hostname=SERVER_HOSTNAME,
                    http_path=HTTP_PATH,
                    auth_type="databricks-oauth",
                )
            return self._connection

    def get_connection(self):
        if self._connection is None:
            raise DatabricksNotConnected("Databricks login required")
        return self._connection

    def test_connection(self):
        with self.get_connection().cursor() as cursor:
            cursor.execute("SELECT CURRENT_TIMESTAMP()")
            return cursor.fetchall()

    def get_features(self):

        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "features.sql"
        )

        query = sql_file.read_text(encoding="utf-8")

        with self.get_connection().cursor() as cursor:

            cursor.execute(query)

            rows = cursor.fetchall()

            columns = [
                column[0]
                for column in cursor.description
            ]

        return [
            dict(zip(columns, row))
            for row in rows
        ]

    def get_feature(self, issue_key: str):

        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "feature.sql"
        )

        query = sql_file.read_text(encoding="utf-8")

        with self.get_connection().cursor() as cursor:

            cursor.execute(
                query,
                (issue_key,)
            )

            row = cursor.fetchone()

            if row is None:
                return None

            columns = [
                column[0]
                for column in cursor.description
            ]

        return dict(zip(columns, row))

    def get_feature_child_issue_keys(self, issue_key: str):

        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "feature_child_issue_keys.sql"
        )

        query = sql_file.read_text(encoding="utf-8")

        with self.get_connection().cursor() as cursor:

            cursor.execute(
                query,
                (issue_key,)
            )

            rows = cursor.fetchall()

        return [
            row[0]
            for row in rows
            if row and row[0]
        ]

    def get_feature_attachments(self, issue_key: str):
        """
        Return all active JIRA attachments for the given feature issue key,
        each enriched with an `artifact_types` list indicating which of the
        four required release artifacts it satisfies:
          - tr_bundle
          - uat_sign_off
          - fut_ut
          - release_notes
        """

        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "feature_attachments.sql"
        )

        query = sql_file.read_text(encoding="utf-8")

        with self.get_connection().cursor() as cursor:

            cursor.execute(query, (issue_key,))

            rows = cursor.fetchall()

            columns = [
                column[0]
                for column in cursor.description
            ]

        attachments = []

        for row in rows:
            record = dict(zip(columns, row))

            # Normalize timestamps so they serialise to JSON cleanly
            for key in ("created",):
                val = record.get(key)
                if hasattr(val, "isoformat"):
                    record[key] = val.isoformat()

            record["artifact_types"] = _classify_attachment(
                record.get("filename"),
                record.get("label"),
            )

            attachments.append(record)

        # Build the checklist: which required artifacts are present?
        found: set[str] = set()
        for att in attachments:
            found.update(att["artifact_types"])

        checklist = {
            "tr_bundle":    "tr_bundle"    in found,
            "uat_sign_off": "uat_sign_off" in found,
            "fut_ut":       "fut_ut"       in found,
            "release_notes":"release_notes" in found,
        }

        return {
            "checklist": checklist,
            "attachments": attachments,
        }

    def lookup_features_by_tokens(self, tokens: list[str]) -> dict[str, dict]:
        """
        Batch-resolve tokens to their parent issue across ALL JIRA projects.

        A token may be any JIRA issue key (DCRTB, DBBT, DMD0, CMD, CTB, CD1,
        DRC, PHOENIX, PRICINGPRO, ASAPIO, ESSRM, ...) resolved via its parent
        chain to the root issue, or a ServiceNow RITM.

        Returns {TOKEN_UPPER: feature_dict} including project_key and opco.
        When a token maps to several issues the closest one (fewest hops) wins.
        Tokens are sent in chunks so a large upload costs a handful of queries.
        """

        tokens = sorted({t.strip().upper() for t in tokens if t and t.strip()})

        if not tokens:
            return {}

        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "tr_lookup_by_ritm.sql"
        )

        template = sql_file.read_text(encoding="utf-8")

        chunk_size = 200
        found: dict[str, dict] = {}

        for start in range(0, len(tokens), chunk_size):

            chunk = tokens[start:start + chunk_size]

            query = template.replace(
                "__TOKENS__", ", ".join(["?"] * len(chunk))
            )

            with self.get_connection().cursor() as cursor:

                cursor.execute(query, tuple(chunk))

                rows = cursor.fetchall()

                columns = [column[0] for column in cursor.description]

            for row in rows:
                record = dict(zip(columns, row))
                token = str(record.pop("matched_key")).strip().upper()
                depth = record.pop("depth")
                best = found.get(token)

                # Prefer the record that is strictly closer (fewer hops).
                # At equal depth, prefer a record that has OpCo over one that
                # doesn't — multiple issues may share the same RITM and only
                # the DCRTB feature will have the OpCo populated.
                if best is None:
                    record["_depth"] = depth
                    found[token] = record
                elif depth < best["_depth"]:
                    record["_depth"] = depth
                    found[token] = record
                elif depth == best["_depth"]:
                    # Same distance — keep whichever has OpCo
                    has_opco = bool(record.get("opco"))
                    best_has_opco = bool(best.get("opco"))
                    if has_opco and not best_has_opco:
                        record["_depth"] = depth
                        found[token] = record

        return found

    def get_defects(self, project_key: str):
        """
        Return all issues for a given JIRA project key (e.g. 'DBBT' or 'DMD0').
        Uses defects.sql with __PROJECT_KEY__ substituted at query time.
        """
        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "defects.sql"
        )
        template = sql_file.read_text(encoding="utf-8")
        query = template.replace("__PROJECT_KEY__", project_key.upper())

        with self.get_connection().cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()
            columns = [column[0] for column in cursor.description]

        return [dict(zip(columns, row)) for row in rows]

    def get_defect(self, issue_key: str):
        """
        Return a single defect row regardless of its project key.
        """
        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "defect.sql"
        )
        query = sql_file.read_text(encoding="utf-8")

        with self.get_connection().cursor() as cursor:
            cursor.execute(query, (issue_key,))
            row = cursor.fetchone()
            if row is None:
                return None
            columns = [column[0] for column in cursor.description]

        return dict(zip(columns, row))

    def get_defect_child_issue_keys(self, issue_key: str):
        """
        Return all direct child issue keys of a defect (no prefix filter).
        """
        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "defect_child_issue_keys.sql"
        )
        query = sql_file.read_text(encoding="utf-8")

        with self.get_connection().cursor() as cursor:
            cursor.execute(query, (issue_key,))
            rows = cursor.fetchall()

        return [row[0] for row in rows if row and row[0]]

    def get_qtest_links(self, issue_key: str):
        """
        Return all qTest / Tricentis remote links attached to the given
        JIRA feature issue key.
        """

        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "feature_qtest_links.sql"
        )

        query = sql_file.read_text(encoding="utf-8")

        with self.get_connection().cursor() as cursor:

            cursor.execute(query, (issue_key,))

            rows = cursor.fetchall()

            columns = [column[0] for column in cursor.description]

        return [dict(zip(columns, row)) for row in rows]