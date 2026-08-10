from databricks import sql

from app.core.config import SERVER_HOSTNAME, HTTP_PATH


def get_connection():
    """
    Creates an authenticated Databricks SQL connection.
    Authentication uses Microsoft Entra ID (OAuth).
    """

    return sql.connect(
        server_hostname=SERVER_HOSTNAME,
        http_path=HTTP_PATH,
        auth_type="databricks-oauth",
    )