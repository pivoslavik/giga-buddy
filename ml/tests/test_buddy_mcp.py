import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import asyncpg
import httpx
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from openai.types.chat import ChatCompletion

from ml.src.mcp.actions import PULL_REQUESTS
from ml.src.mcp.client import BuddyMCPClient
from ml.src.mcp.server import app
from ml.src.chat.model_api_manager import ModelAPIManager
from ml.src.chat.service import ChatService
from ml.src.chat.store import ChatMessage


def test_mcp_chat_and_confirmed_actions(monkeypatch):
    dsn = os.getenv("ML_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Set ML_TEST_DATABASE_URL to a PostgreSQL test database")
    monkeypatch.setenv("DATABASE_URL", dsn)
    monkeypatch.setenv("BUDDY_MCP_TOKEN", "chat-token")
    monkeypatch.setenv("BUDDY_MCP_SUBMIT_TOKEN", "submit-token")

    def http_client(headers=None, timeout=None, auth=None):
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            headers=headers,
            timeout=timeout,
            auth=auth,
        )

    async def call(session, name, **args):
        result = await session.call_tool(name, args)
        assert not result.isError
        assert result.structuredContent["demo"] is True
        return result.structuredContent

    def connect(user_id, token="chat-token"):
        return streamablehttp_client(
            "http://test/mcp",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Buddy-User-ID": str(user_id),
            },
            httpx_client_factory=http_client,
        )

    @asynccontextmanager
    async def database():
        schema = f"mcp_test_{uuid4().hex}"
        db = await asyncpg.connect(dsn)
        try:
            await db.execute(f"CREATE SCHEMA {schema}")
            await db.execute(f"SET search_path TO {schema}")
            migrations = Path(__file__).resolve().parents[2] / "infra" / "postgres"
            for name in (
                "000002_create_users.up.sql",
                "000008_create_demo_actions.up.sql",
            ):
                await db.execute((migrations / name).read_text())
            await db.execute("""
                INSERT INTO users (username, password, email, role, display_name)
                VALUES ('one', 'unused', 'one@example.test', 'intern', 'One'),
                       ('two', 'unused', 'two@example.test', 'intern', 'Two')
            """)
            create_pool = asyncpg.create_pool
            with monkeypatch.context() as patch:
                patch.setattr(
                    "ml.src.mcp.server.asyncpg.create_pool",
                    lambda *args, **kwargs: create_pool(
                        *args, **kwargs, server_settings={"search_path": schema}
                    ),
                )
                async with app.router.lifespan_context(app):
                    yield
        finally:
            try:
                await db.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
            finally:
                await db.close()

    async def exercise():
        async with database():
            async with connect(1) as (read, write, _), ClientSession(
                read, write
            ) as session:
                await session.initialize()
                closed = await call(session, "knowledge_get_page", page_id="cat-dev")
                missing = await call(session, "knowledge_get_page", page_id="unknown")
                assert closed == missing == {"demo": True, "status": "unavailable"}
                search = await call(
                    session, "knowledge_search", query="Примеры задач команды CAT"
                )
                assert all(page["page_id"] != "cat-dev" for page in search["pages"])

                def response(message):
                    return ChatCompletion.model_validate(
                        {
                            "id": "demo",
                            "created": 0,
                            "model": "demo",
                            "object": "chat.completion",
                            "choices": [
                                {
                                    "index": 0,
                                    "message": {"role": "assistant", **message},
                                    "finish_reason": (
                                        "tool_calls"
                                        if message.get("tool_calls")
                                        else "stop"
                                    ),
                                }
                            ],
                        }
                    )

                create = AsyncMock(
                    side_effect=[
                        response(
                            {
                                "tool_calls": [
                                    {
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {
                                            "name": "access_prepare",
                                            "arguments": '{"resource":"CAT-DEV","justification":"Первая задача"}',
                                        },
                                    }
                                ]
                            }
                        ),
                    ]
                )
                model = ModelAPIManager(
                    SimpleNamespace(
                        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
                    ),
                    "demo",
                )
                messages = [{"role": "user", "content": "Подготовь доступ к CAT-DEV"}]
                preview = await model.collect_tool_results(messages, session)
                assert "Первая задача" in preview
                assert all(
                    not tool["function"]["name"].endswith("_submit")
                    for tool in create.call_args.kwargs["tools"]
                )
                draft = json.loads(messages[-1]["content"])
                assert draft["status"] == "awaiting_confirmation"
                confirmation = {
                    "action_id": draft["action_id"],
                    "version": draft["version"],
                }
                assert (await session.call_tool("access_submit", confirmation)).isError
                duplicate = await call(
                    session,
                    "access_prepare",
                    resource="CAT-DEV",
                    justification="Другая задача",
                )

                assert (
                    await call(
                        session,
                        "review_prepare",
                        pr_number=41,
                        reviewer="demo-reviewer",
                    )
                )["status"] == "blocked"
                review = await call(
                    session, "review_prepare", pr_number=42, reviewer="demo-reviewer"
                )
                stale_review = await call(
                    session, "review_prepare", pr_number=42, reviewer="demo-reviewer"
                )
                absence = await call(
                    session,
                    "absence_prepare",
                    absence_type="short_leave",
                    start="2026-11-16T13:00:00+03:00",
                    end="2026-11-16T16:00:00+03:00",
                )
                overlap = await call(
                    session,
                    "absence_prepare",
                    absence_type="short_leave",
                    start="2026-11-16T10:30:00Z",
                    end="2026-11-16T12:00:00Z",
                )

            def local_transport(url, **kwargs):
                return streamablehttp_client(
                    url, httpx_client_factory=http_client, **kwargs
                )

            monkeypatch.setattr(
                "ml.src.mcp.client.streamablehttp_client", local_transport
            )
            client = BuddyMCPClient("http://test/mcp", "chat-token", "submit-token")
            command = f"Подтверждаю {draft['action_id']} {draft['version']}"
            assert command in preview
            store = SimpleNamespace(
                get_history=AsyncMock(return_value=[ChatMessage("user", command)])
            )
            chat = ChatService(store, None, model, client)
            assert "недоступен" in await chat.generate_reply(2, 1)
            reply, duplicate_result = await asyncio.gather(
                chat.generate_reply(1, 1),
                client.submit_draft(1, duplicate["action_id"], duplicate["version"]),
            )
            assert "Ожидает согласования" in reply
            assert duplicate_result["request_id"] in reply
            stream = await chat.stream_reply(1, 1)
            assert [part async for part in stream] == [reply]
            for other, prefix in ((review, "REV-"), (absence, "ABS-")):
                command = f"Подтверждаю {other['action_id']} {other['version']}"
                store.get_history.return_value = [ChatMessage("user", command)]
                assert prefix in await chat.generate_reply(1, 2)
            monkeypatch.setitem(PULL_REQUESTS[42], "commit", "new")
            command = (
                f"Подтверждаю {stale_review['action_id']} {stale_review['version']}"
            )
            store.get_history.return_value = [ChatMessage("user", command)]
            assert "Данные PR изменились" in await chat.generate_reply(1, 3)
            async with connect(1, "submit-token") as (read, write, _), ClientSession(
                read, write
            ) as session:
                await session.initialize()
                submitted = await call(session, "access_submit", **confirmation)
                assert submitted["status"] == "pending_approval"
                assert submitted["request_id"] in reply
                assert await call(session, "access_submit", **confirmation) == submitted
                changes = await call(
                    session, "review_submit", action_id=review["action_id"], version=2
                )
                assert changes["status"] == "unavailable"
                assert (
                    await call(
                        session,
                        "absence_submit",
                        action_id=absence["action_id"],
                        version=1,
                    )
                )["status"] == "pending_approval"
                assert (
                    await call(
                        session,
                        "absence_submit",
                        action_id=overlap["action_id"],
                        version=1,
                    )
                )["status"] == "overlap"
            async with connect(1) as (read, write, _), ClientSession(
                read, write
            ) as session:
                await session.initialize()
                saved = await call(
                    session, "access_get_request", request_id=submitted["request_id"]
                )
                assert saved["payload"] in (draft["payload"], duplicate["payload"])
            async with connect(2) as (read, write, _), ClientSession(
                read, write
            ) as session:
                await session.initialize()
                page = await call(session, "knowledge_get_page", page_id="cat-dev")
                assert page["page"]["space_key"] == "CAT-DEV"
                hidden = await call(
                    session, "access_get_request", request_id=submitted["request_id"]
                )
                assert hidden["status"] == "unavailable"

    asyncio.run(exercise())
