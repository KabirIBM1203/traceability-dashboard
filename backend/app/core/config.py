import os
from dotenv import load_dotenv

load_dotenv()

SERVER_HOSTNAME = os.getenv("DATABRICKS_SERVER_HOSTNAME")
HTTP_PATH       = os.getenv("DATABRICKS_HTTP_PATH")
GENIE_SPACE_ID  = os.getenv("GENIE_SPACE_ID")

# SharePoint source for RevTrac Excel exports
SP_TENANT_ID     = os.getenv("SP_TENANT_ID")
SP_CLIENT_ID     = os.getenv("SP_CLIENT_ID")
SP_CLIENT_SECRET = os.getenv("SP_CLIENT_SECRET")
SP_SITE_URL      = os.getenv("SP_SITE_URL")       # e.g. https://contoso.sharepoint.com/sites/MySite
SP_FOLDER_PATH   = os.getenv("SP_FOLDER_PATH")    # e.g. /Shared Documents/RevTrac