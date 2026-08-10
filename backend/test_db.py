import os
from pathlib import Path

from dotenv import load_dotenv
from databricks import sql

# ----------------------------------------------------
# Load .env explicitly
# ----------------------------------------------------
env_path = Path(__file__).parent / ".env"

print("=" * 60)
print("Loading .env from:", env_path)
print("=" * 60)

load_dotenv(dotenv_path=env_path)

# ----------------------------------------------------
# Read environment variables
# ----------------------------------------------------
hostname = os.getenv("DATABRICKS_SERVER_HOSTNAME")
http_path = os.getenv("DATABRICKS_HTTP_PATH")

print("Hostname :", hostname)
print("HTTP Path:", http_path)
print()

if not hostname:
    raise Exception(
        "DATABRICKS_SERVER_HOSTNAME was not loaded from .env"
    )

if not http_path:
    raise Exception(
        "DATABRICKS_HTTP_PATH was not loaded from .env"
    )

print("Environment loaded successfully.")
print("Attempting Databricks connection...")
print()

# ----------------------------------------------------
# Connect
# ----------------------------------------------------
with sql.connect(
    server_hostname=hostname,
    http_path=http_path,
    auth_type="databricks-oauth",
) as connection:

    print("Connected successfully!")

    with connection.cursor() as cursor:
        cursor.execute("SELECT CURRENT_TIMESTAMP()")

        result = cursor.fetchall()

        print()
        print("Query Result:")
        print(result)