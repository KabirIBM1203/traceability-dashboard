from app.core.databricks_client import get_connection


class DatabricksService:

    def execute_query(self, query: str):

        with get_connection() as connection:

            with connection.cursor() as cursor:

                cursor.execute(query)

                columns = [col[0] for col in cursor.description]

                rows = cursor.fetchall()

                result = [
                    dict(zip(columns, row))
                    for row in rows
                ]

                return result