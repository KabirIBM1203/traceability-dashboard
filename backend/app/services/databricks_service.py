from pathlib import Path

from databricks import sql

from app.core.config import SERVER_HOSTNAME, HTTP_PATH


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