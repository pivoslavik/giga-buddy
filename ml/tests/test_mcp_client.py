import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from ml.src.mcp import client


@pytest.fixture
def anyio_backend():
    return "asyncio"


def result(content=None, *, error=False):
    return SimpleNamespace(structuredContent=content, isError=error)


@pytest.fixture
def connection(monkeypatch):
    transport = MagicMock()
    transport.return_value.__aenter__.return_value = ("reader", "writer", None)
    session_context = MagicMock()
    session = SimpleNamespace(initialize=AsyncMock(), call_tool=AsyncMock())
    session_context.return_value.__aenter__.return_value = session
    monkeypatch.setattr(client, "streamablehttp_client", transport)
    monkeypatch.setattr(client, "ClientSession", session_context)
    return session, transport


@pytest.mark.anyio
@pytest.mark.parametrize(
    "raw, name, response, expected",
    [
        ("{}", "access_submit", None, "tool_unavailable"),
        ("{broken", "knowledge_search", None, "invalid_arguments"),
        ("[]", "knowledge_search", None, "invalid_arguments"),
        ('{"query":"доступ"}', "knowledge_search", result(error=True), "tool_failed"),
        ('{"query":"доступ"}', "knowledge_search", result(), "tool_failed"),
        ('{"query":"доступ"}', "knowledge_search", result({"page": "Доступ"}), None),
    ],
)
async def test_call_chat_tool(raw, name, response, expected):
    session = SimpleNamespace(call_tool=AsyncMock(return_value=response))
    output = await client.call_chat_tool(session, name, raw)
    if response is None:
        session.call_tool.assert_not_called()
    else:
        session.call_tool.assert_awaited_once_with(name, {"query": "доступ"})
    assert json.loads(output) == (
        {"error": expected} if expected else {"page": "Доступ"}
    )


@pytest.mark.anyio
@pytest.mark.parametrize(
    "draft, submit_token, submission, expected",
    [
        (result(error=True), "submit", None, "tool_failed"),
        (result({"kind": "unknown", "version": 1}), "submit", None, "unavailable"),
        (result({"kind": "access", "version": 2}), "submit", None, "unavailable"),
        (result({"kind": "access", "version": 1}), "", None, "submission_disabled"),
        (result({"kind": "access", "version": 1}), "submit", result(), "tool_failed"),
        (
            result({"kind": "access", "version": 1}),
            "submit",
            result({"status": "pending_approval"}),
            "pending_approval",
        ),
    ],
)
async def test_submit_draft_uses_distinct_credentials(
    connection, draft, submit_token, submission, expected
):
    session, transport = connection
    url = "http://mcp.test/mcp"
    buddy = client.BuddyMCPClient(url, "read", submit_token)
    session.call_tool.side_effect = (
        [draft] if submission is None else [draft, submission]
    )
    assert await buddy.submit_draft(7, "abc", 1) == {"status": expected}
    assert session.call_tool.await_args_list[0].args == (
        "action_get_draft",
        {"action_id": "abc"},
    )
    expected_tokens = ["read"] if submission is None else ["read", "submit"]
    assert [call.kwargs["headers"] for call in transport.call_args_list] == [
        {"Authorization": f"Bearer {token}", "X-Buddy-User-ID": "7"}
        for token in expected_tokens
    ]
    assert all(call.args == (url,) for call in transport.call_args_list)
    assert session.initialize.await_count == len(expected_tokens)
    if submission is not None:
        assert session.call_tool.await_args.args == (
            "access_submit",
            {"action_id": "abc", "version": 1},
        )


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token, response, status",
    [
        ("", None, "submission_disabled"),
        ("submit", result(error=True), "tool_failed"),
        ("submit", result({"status": "approved"}), "approved"),
    ],
)
async def test_approve_demo_access(connection, token, response, status):
    session, transport = connection
    session.call_tool.return_value = response
    buddy = client.BuddyMCPClient("http://mcp.test/mcp", "read", token)
    assert await buddy.approve_demo_access(7, "ACC-abc") == {"status": status}
    if token:
        assert transport.call_args.kwargs["headers"]["Authorization"] == "Bearer submit"
        session.call_tool.assert_awaited_once_with(
            "access_demo_approve", {"request_id": "ACC-abc"}
        )
    else:
        transport.assert_not_called()
