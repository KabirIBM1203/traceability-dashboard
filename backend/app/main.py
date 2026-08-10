from fastapi import FastAPI

from app.services.databricks_service import DatabricksService

app = FastAPI(title="Traceability Dashboard API")

db = DatabricksService()


@app.get("/")
def root():
    return {"application": "Traceability Dashboard API"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/db-test")
def db_test():

    result = db.execute_query("SELECT CURRENT_TIMESTAMP()")

    return result