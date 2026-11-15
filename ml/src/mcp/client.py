import json
from contextlib import asynccontextmanager

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

CHAT_TOOLS = {
    "knowledge_search",
    "knowledge_get_page",
    "access_inspect",
    "access_prepare",
    "access_get_request",
    "pull_request_inspect",
    "review_prepare",
    "review_get_status",
    "absence_options",
    "absence_prepare",
    "absence_get_request",
}


class BuddyMCPClient:
    def __init__(self, url: str, token: str, submit_token: str = "") -> None:
        self.url = url
        self.token = token
        self.submit_token = submit_token

    @asynccontextmanager
    async def connect(self, user_id: int, *, submit: bool = False):
        headers = {
            "Authorization": f"Bearer {self.submit_token if submit else self.token}",
            "X-Buddy-User-ID": str(user_id),
        }
        async with streamablehttp_client(self.url, headers=headers, timeout=10) as (
            read,
            write,
            _,
        ):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session

    async def submit_draft(self, user_id: int, action_id: str, version: int) -> dict:
        async with self.connect(user_id) as session:
            result = await session.call_tool(
                "action_get_draft", {"action_id": action_id}
            )
        draft = result.structuredContent
        if result.isError or draft is None:
            return {"status": "tool_failed"}
        kind = draft.get("kind")
        if (
            kind not in ("access", "review", "absence")
            or draft.get("version") != version
        ):
            return {"status": "unavailable"}
        if not self.submit_token:
            return {"status": "submission_disabled"}
        async with self.connect(user_id, submit=True) as session:
            result = await session.call_tool(
                f"{kind}_submit", {"action_id": action_id, "version": version}
            )
        if result.isError or result.structuredContent is None:
            return {"status": "tool_failed"}
        return result.structuredContent

    async def approve_demo_access(self, user_id: int, request_id: str) -> dict:
        if not self.submit_token:
            return {"status": "submission_disabled"}
        async with self.connect(user_id, submit=True) as session:
            result = await session.call_tool(
                "access_demo_approve", {"request_id": request_id}
            )
        if result.isError or result.structuredContent is None:
            return {"status": "tool_failed"}
        return result.structuredContent


async def call_chat_tool(session: ClientSession, name: str, raw_arguments: str) -> str:
    if name not in CHAT_TOOLS:
        return '{"error":"tool_unavailable"}'
    try:
        arguments = json.loads(raw_arguments)
    except ValueError:
        return '{"error":"invalid_arguments"}'
    if not isinstance(arguments, dict):
        return '{"error":"invalid_arguments"}'
    result = await session.call_tool(name, arguments)
    if result.isError or result.structuredContent is None:
        return '{"error":"tool_failed"}'
    return json.dumps(result.structuredContent, ensure_ascii=False)
