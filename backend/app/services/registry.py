"""
Shared singletons, so every router (and the login gate) uses the SAME
Databricks connection and the SAME in-memory RevTrac data.
"""

from app.services.databricks_service import DatabricksService
from app.services.revtrac_service import RevTracService

db_service = DatabricksService()
revtrac_service = RevTracService()
