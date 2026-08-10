from fastapi import APIRouter, HTTPException

from app.services.databricks_service import DatabricksService
from app.services.revtrac_service import RevTracService


router = APIRouter(
    prefix="/api/features",
    tags=["Features"]
)

db_service = DatabricksService()
revtrac_service = RevTracService()


@router.get("")
def get_features():
    """
    Return all DCRTB features from Databricks.
    """

    return db_service.get_features()


@router.get("/{issue_key}")
def get_feature(issue_key: str):
    """
    Return a single DCRTB feature together with
    its RevTrac and transport details.
    """

    features = db_service.get_features()

    feature = next(
        (
            item
            for item in features
            if str(item.get("issue_key", "")).upper()
            == issue_key.upper()
        ),
        None,
    )

    if feature is None:
        raise HTTPException(
            status_code=404,
            detail=f"Feature {issue_key} not found"
        )

    feature["revtrac"] = (
        revtrac_service.get_revtrac_for_feature(issue_key)
    )

    return feature