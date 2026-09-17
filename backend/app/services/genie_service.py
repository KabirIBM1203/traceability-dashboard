"""
GenieService — thin wrapper around the Databricks Genie SDK.

  • start_conversation_and_wait  → new question, returns (conversation_id, answer)
  • ask_question_and_wait        → follow-up within an existing conversation

Authentication
--------------
Uses the SDK's "external-browser" auth type — a browser popup (Microsoft
Entra ID / Databricks OAuth) that fires once on first use and caches a
refresh token on disk so subsequent restarts skip the popup.

DATABRICKS_AUTH_TYPE=oauth is set in .env (M2M, needs client_secret).
We temporarily remove it from os.environ before constructing Config so
the SDK uses our explicit auth_type="external-browser" instead.
"""

import os

from databricks.sdk import WorkspaceClient
from databricks.sdk.config import Config

from app.core.config import SERVER_HOSTNAME, GENIE_SPACE_ID


# ---------------------------------------------------------------------------
# SDK client — singleton
# ---------------------------------------------------------------------------

def _make_client() -> WorkspaceClient:
    # Pop DATABRICKS_AUTH_TYPE ("oauth") from the environment for the duration
    # of Config construction so it cannot override our explicit auth_type.
    _saved = os.environ.pop("DATABRICKS_AUTH_TYPE", None)
    try:
        host = SERVER_HOSTNAME
        if host and not host.startswith("http"):
            host = f"https://{host}"
        cfg = Config(
            host=host,
            auth_type="external-browser",
        )
        client = WorkspaceClient(config=cfg)
    finally:
        if _saved is not None:
            os.environ["DATABRICKS_AUTH_TYPE"] = _saved
    return client


_client: WorkspaceClient | None = None


def _get_client() -> WorkspaceClient:
    global _client
    if _client is None:
        _client = _make_client()
    return _client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_answer(response) -> str:
    """
    Walk the response attachments and return the first non-empty text content.
    Falls back to a polite notice if Genie returned no textual answer
    (e.g. it produced only a query result table).
    """
    for attachment in (response.attachments or []):
        text_obj = getattr(attachment, "text", None)
        if text_obj:
            content = getattr(text_obj, "content", None)
            if content:
                return content

    return (
        "Genie processed your request but did not return a text answer. "
        "It may have produced a data result — please check the Genie space directly."
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class GenieService:

    def ask(self, question: str) -> dict:
        """
        Start a brand-new Genie conversation.

        Returns:
            {
                "conversation_id": str,
                "message_id":      str,
                "answer":          str,
            }
        """
        client = _get_client()

        response = client.genie.start_conversation_and_wait(
            space_id=GENIE_SPACE_ID,
            content=question,
        )

        conversation_id = getattr(response, "conversation_id", None)
        message_id      = getattr(response, "id", None)

        return {
            "conversation_id": str(conversation_id) if conversation_id else None,
            "message_id":      str(message_id)      if message_id      else None,
            "answer":          _extract_answer(response),
        }

    def followup(self, conversation_id: str, question: str) -> dict:
        """
        Continue an existing Genie conversation.

        Returns:
            {
                "conversation_id": str,
                "message_id":      str,
                "answer":          str,
            }
        """
        client = _get_client()

        response = client.genie.create_message_and_wait(
            space_id=GENIE_SPACE_ID,
            conversation_id=conversation_id,
            content=question,
        )

        message_id = getattr(response, "id", None)

        return {
            "conversation_id": conversation_id,
            "message_id":      str(message_id) if message_id else None,
            "answer":          _extract_answer(response),
        }
