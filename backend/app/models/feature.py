from pydantic import BaseModel


class Feature(BaseModel):
    issue_key: str
    summary: str
    status: str
    stream: str | None = None
    request_type: str | None = None
    ritm: str | None = None
    fix_version: str | None = None
    opco: str | None = None