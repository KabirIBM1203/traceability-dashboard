import re
from pathlib import Path

from databricks import sql

from app.core.config import SERVER_HOSTNAME, HTTP_PATH


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
        # Establish the connection once and reuse it across all
        # requests so that the OAuth handshake (browser popup) only
        # happens a single time at startup rather than on every call.
        self._connection = sql.connect(
            server_hostname=SERVER_HOSTNAME,
            http_path=HTTP_PATH,
            auth_type="databricks-oauth",
        )

    def get_connection(self):
        return self._connection

    def test_connection(self):
        with self._connection.cursor() as cursor:
            cursor.execute("SELECT CURRENT_TIMESTAMP()")
            return cursor.fetchall()

    def get_features(self):

        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "features.sql"
        )

        query = sql_file.read_text(encoding="utf-8")

        with self._connection.cursor() as cursor:

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

        with self._connection.cursor() as cursor:

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

        with self._connection.cursor() as cursor:

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

        with self._connection.cursor() as cursor:

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