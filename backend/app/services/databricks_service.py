from pathlib import Path

from databricks import sql

from app.core.config import SERVER_HOSTNAME, HTTP_PATH


class DatabricksService:

    def get_connection(self):
        return sql.connect(
            server_hostname=SERVER_HOSTNAME,
            http_path=HTTP_PATH,
            auth_type="databricks-oauth",
        )

    def test_connection(self):
        with self.get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT CURRENT_TIMESTAMP()")
                return cursor.fetchall()

    def get_features(self):

        sql_file = (
            Path(__file__).resolve().parents[1]
            / "queries"
            / "features.sql"
        )

        query = sql_file.read_text(encoding="utf-8")

        with self.get_connection() as connection:
            with connection.cursor() as cursor:

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

        with self.get_connection() as connection:
            with connection.cursor() as cursor:

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