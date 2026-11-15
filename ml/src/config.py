from dataclasses import dataclass, field
from os import environ


def _check_non_negative_int(name: str, value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a non-negative integer") from exc
    if number < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return number


@dataclass(frozen=True)
class Config:
    database_url: str = field(repr=False)
    openai_base_url: str
    openai_api_key: str = field(repr=False)
    openai_chat_model: str
    messages_to_context: int
    documents_to_context: int
    inference_max_waiting: int
    buddy_mcp_token: str = field(repr=False)
    buddy_mcp_submit_token: str = field(repr=False)
    buddy_mcp_url: str
    embeddings_model_path: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            database_url=environ["DATABASE_URL"],
            openai_base_url=environ["OPENAI_BASE_URL"],
            openai_api_key=environ["OPENAI_API_KEY"],
            openai_chat_model=environ["OPENAI_CHAT_MODEL"],
            messages_to_context=_check_non_negative_int(
                "MESSAGES_TO_CONTEXT", environ["MESSAGES_TO_CONTEXT"]
            ),
            documents_to_context=_check_non_negative_int(
                "DOCUMENTS_TO_CONTEXT", environ["DOCUMENTS_TO_CONTEXT"]
            ),
            inference_max_waiting=_check_non_negative_int(
                "ML_INFERENCE_MAX_WAITING", environ["ML_INFERENCE_MAX_WAITING"]
            ),
            buddy_mcp_token=environ["BUDDY_MCP_TOKEN"],
            buddy_mcp_submit_token=environ["BUDDY_MCP_SUBMIT_TOKEN"],
            buddy_mcp_url=environ["BUDDY_MCP_URL"],
            embeddings_model_path=environ["ML_MODEL_PATH"],
        )
