import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from ml.src.mcp import server
from ml.src.mcp.actions import DemoActions

ACTION_ID = "a" * 32
START = "2026-11-16T12:00:00+03:00"
END = "2026-11-16T13:00:00+03:00"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def pool():
    pool = MagicMock(
        execute=AsyncMock(),
        fetch=AsyncMock(),
        fetchrow=AsyncMock(),
        fetchval=AsyncMock(),
    )
    pool.acquire.return_value.__aenter__.return_value = MagicMock(
        fetchval=AsyncMock(),
        fetchrow=AsyncMock(),
        fetch=AsyncMock(),
        execute=AsyncMock(),
    )
    return pool


@pytest.fixture(scope="module")
def mcp_http_client():
    create_pool = MagicMock()
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("DATABASE_URL", "test-dsn")
        patch.setattr(server.asyncpg, "create_pool", create_pool)
        with TestClient(server.app, base_url="http://localhost") as client:
            yield client
    assert create_pool.call_args.args == ("test-dsn",)
    create_pool.return_value.__aexit__.assert_awaited_once()


@pytest.fixture
def mcp_call(monkeypatch, pool, mcp_http_client):
    monkeypatch.setenv("BUDDY_MCP_TOKEN", "read-secret")
    monkeypatch.setenv("BUDDY_MCP_SUBMIT_TOKEN", "submit-secret")
    monkeypatch.setattr(server.app.state.actions, "pool", pool)

    def call(tool, arguments, *, token="read-secret", user="7"):
        response = mcp_http_client.post(
            "/mcp",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Buddy-User-ID": user,
                "Accept": "application/json, text/event-stream",
            },
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": tool, "arguments": arguments},
            },
        )
        assert response.status_code == 200, response.text
        return response.json()["result"]

    return call


def test_knowledge_visibility_and_search(mcp_call):
    get = {"page_id": "cat-dev"}
    assert (
        mcp_call("knowledge_get_page", get)["structuredContent"]["status"]
        == "unavailable"
    )
    visible = mcp_call("knowledge_get_page", get, user="2")["structuredContent"]
    assert visible["demo"] is True
    assert visible["page"]["space_key"] == "CAT-DEV"
    query = {"query": "Синтетические примеры задач команды CAT"}
    limited = mcp_call("knowledge_search", query)["structuredContent"]["pages"]
    full = mcp_call("knowledge_search", query, user="2")["structuredContent"]["pages"]
    assert all(page["page_id"] != "cat-dev" for page in limited)
    assert full[0]["page_id"] == "cat-dev"


@pytest.mark.parametrize(
    "token, user",
    [
        ("wrong", "7"),
        ("read-secret", "x"),
        ("read-secret", "0"),
        ("read-secret", str(2**63)),
    ],
)
def test_mcp_rejects_invalid_credentials(mcp_call, token, user):
    result = mcp_call("absence_options", {}, token=token, user=user)
    assert result["isError"]
    assert "Недоступно" in result["content"][0]["text"]


@pytest.mark.parametrize(
    "kind, arguments, expected",
    [
        (
            "access",
            {"resource": "CAT-DEV", "justification": "  Первая задача  "},
            {"resource": "CAT-DEV", "level": "read", "justification": "Первая задача"},
        ),
        (
            "review",
            {"pr_number": 42, "reviewer": "demo-reviewer"},
            {"pr_number": 42, "commit": "a8c41fe", "reviewer": "demo-reviewer"},
        ),
        (
            "absence",
            {"start": START, "end": END, "absence_type": "short_leave"},
            {
                "start": "2026-11-16T09:00:00.000000+00:00",
                "end": "2026-11-16T10:00:00.000000+00:00",
                "requested_start": START,
            },
        ),
    ],
)
def test_draft_lifecycle_through_mcp(mcp_call, pool, kind, arguments, expected):
    prepared = mcp_call(f"{kind}_prepare", arguments)["structuredContent"]
    assert prepared["demo"] is True
    assert prepared["status"] == "awaiting_confirmation"
    assert prepared["version"] == 1
    assert {key: prepared["payload"][key] for key in expected} == expected
    action_id = prepared["action_id"]
    payload_json = pool.execute.await_args.args[-1]
    assert pool.execute.await_args.args[1:4] == (action_id, 7, kind)
    assert json.loads(payload_json) == prepared["payload"]

    lookup = {"action_id": action_id}
    pool.fetchrow.return_value = (kind, payload_json, "awaiting_confirmation")
    draft = mcp_call("action_get_draft", lookup)["structuredContent"]
    assert draft["kind"] == kind
    assert draft["payload"] == prepared["payload"]
    assert pool.fetchrow.await_args.args[1:] == (action_id, 7)

    submit = {**lookup, "version": 1}
    db = pool.acquire.return_value.__aenter__.return_value
    db.fetchrow.return_value = (payload_json, None, "awaiting_confirmation")
    db.fetch.return_value = []
    assert mcp_call(f"{kind}_submit", submit)["isError"]
    db.execute.assert_not_called()

    result = mcp_call(f"{kind}_submit", submit, token="submit-secret")[
        "structuredContent"
    ]
    prefix, status = {
        "access": ("ACC", "pending_approval"),
        "review": ("REV", "review_requested"),
        "absence": ("ABS", "pending_approval"),
    }[kind]
    request_id = f"{prefix}-{action_id}"
    assert result == {"demo": True, "request_id": request_id, "status": status}
    assert db.fetchval.await_args.args[1:] == (7,)
    assert db.fetchrow.await_args.args[1:] == (action_id, 7, kind)
    assert db.execute.await_args.args[1:] == (request_id, status, action_id)
    db.transaction.return_value.__aexit__.assert_awaited_once()

    if kind == "review":
        pool.fetch.return_value = [
            {
                "external_id": request_id,
                "status": status,
                "commit": expected["commit"],
                "reviewer": expected["reviewer"],
            }
        ]
        result = mcp_call("review_get_status", {"pr_number": 42})["structuredContent"]
        assert result["current_commit"] == expected["commit"]
        assert result["requests"][0] == {
            "request_id": request_id,
            "status": status,
            "commit": expected["commit"],
            "reviewer": expected["reviewer"],
        }
        assert pool.fetch.await_args.args[1:] == (7, "42")
    else:
        pool.fetchrow.return_value = (status, payload_json)
        result = mcp_call(f"{kind}_get_request", {"request_id": request_id})[
            "structuredContent"
        ]
        assert result == {
            "demo": True,
            "request_id": request_id,
            "status": status,
            "payload": prepared["payload"],
        }
        assert pool.fetchrow.await_args.args[1:] == (7, kind, request_id)


def test_access_approval_requires_separate_submit_secret(mcp_call, pool, monkeypatch):
    arguments = {"request_id": "ACC-" + ACTION_ID}
    pool.fetchval.return_value = "approved"
    result = mcp_call("access_demo_approve", arguments, token="submit-secret")
    assert result["structuredContent"]["status"] == "approved"
    assert pool.fetchval.await_args.args[1:] == (7, arguments["request_id"])

    monkeypatch.setenv("BUDDY_MCP_SUBMIT_TOKEN", "read-secret")
    assert mcp_call("access_demo_approve", arguments)["isError"]
    pool.fetchval.assert_awaited_once()


@pytest.mark.parametrize(
    "tool, args, expected",
    [
        ("access_inspect", {"resource": "unknown"}, {"status": "unavailable"}),
        (
            "access_prepare",
            {"resource": "CAT-DEV", "justification": "   "},
            {"status": "invalid_justification"},
        ),
        ("pull_request_inspect", {"pr_number": 41}, {"failed_check": "unit-tests"}),
        (
            "review_prepare",
            {"pr_number": 41, "reviewer": "demo-reviewer"},
            {"status": "blocked"},
        ),
        (
            "review_prepare",
            {"pr_number": 123, "reviewer": "demo-reviewer"},
            {"status": "unavailable"},
        ),
        ("absence_options", {}, {"types": ["short_leave"]}),
        (
            "absence_prepare",
            {"start": "2026-11-16T12:00:00", "end": END, "absence_type": "short_leave"},
            {"status": "invalid_interval"},
        ),
    ],
)
def test_mcp_returns_validation_and_inspection_results(
    mcp_call, pool, tool, args, expected
):
    result = mcp_call(tool, args)["structuredContent"]
    assert {key: result[key] for key in expected} == expected
    pool.execute.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "kind, payload, previous, expected",
    [
        (
            "access",
            {"resource": "CAT-DEV"},
            {"resource": "CAT-DEV"},
            {"request_id": "old", "status": "approved"},
        ),
        (
            "review",
            {"pr_number": 42, "commit": "a8c41fe", "reviewer": "demo-reviewer"},
            {"pr_number": 42, "commit": "a8c41fe"},
            {"request_id": "old", "status": "approved"},
        ),
        (
            "review",
            {"pr_number": 42, "commit": "stale", "reviewer": "demo-reviewer"},
            {},
            {"status": "recheck_required"},
        ),
        (
            "absence",
            {"start": START, "end": END},
            {"start": START, "end": END},
            {"status": "overlap"},
        ),
    ],
)
async def test_submit_avoids_duplicate_stale_or_overlapping_requests(
    pool, kind, payload, previous, expected
):
    db = pool.acquire.return_value.__aenter__.return_value
    db.fetchrow.return_value = (json.dumps(payload), None, "awaiting_confirmation")
    db.fetch.return_value = [(json.dumps(previous), "old", "approved")]
    assert await DemoActions(pool).submit(7, kind, ACTION_ID, 1) == expected
    db.execute.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "row, version, expected",
    [
        (None, 1, {"status": "unavailable"}),
        (("{}", "ACC-existing", "approved"), 2, {"status": "unavailable"}),
        (
            ("{}", "ACC-existing", "approved"),
            1,
            {"status": "approved", "request_id": "ACC-existing"},
        ),
    ],
)
async def test_submit_handles_missing_version_and_retries(pool, row, version, expected):
    db = pool.acquire.return_value.__aenter__.return_value
    db.fetchrow.return_value = row
    assert await DemoActions(pool).submit(7, "access", ACTION_ID, version) == expected
    db.fetch.assert_not_awaited()


@pytest.mark.anyio
async def test_missing_drafts_and_requests_report_unavailable(pool):
    pool.fetchrow.return_value = None
    pool.fetchval.return_value = None
    actions = DemoActions(pool)
    assert await actions.get_draft(7, ACTION_ID) == {"status": "unavailable"}
    assert await actions.get(7, "access", "missing") == {"status": "unavailable"}
    assert await actions.approve_access(7, "missing") == {"status": "unavailable"}
