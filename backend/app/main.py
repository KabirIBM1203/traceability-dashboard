from fastapi import FastAPI

app = FastAPI(title="Traceability Dashboard API")

@app.get("/")
def root():
    return {
        "application": "Traceability Dashboard API",
        "status": "running"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }