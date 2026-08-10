from pathlib import Path

from app.services.databricks_service import DatabricksService


class FeatureService:

    def __init__(self):
        self.db = DatabricksService()

    def get_features(self):

        sql_path = (
            Path(__file__).parent.parent
            / "queries"
            / "features.sql"
        )

        query = sql_path.read_text(encoding="utf-8")

        return self.db.execute_query(query)