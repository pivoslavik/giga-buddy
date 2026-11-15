"""Confirm a saved test draft over the internal MCP connection."""

import argparse
import asyncio
import json
import os

from .client import BuddyMCPClient


async def run(args: argparse.Namespace) -> None:
    url = os.environ["BUDDY_MCP_URL"]
    read_client = BuddyMCPClient(url, os.environ["BUDDY_MCP_TOKEN"])
    async with read_client.connect(args.user_id) as session:
        result = await session.call_tool(
            "action_get_draft", {"action_id": args.action_id}
        )
        draft = result.structuredContent
        if (
            result.isError
            or not draft
            or draft.get("kind") not in ("access", "review", "absence")
        ):
            raise SystemExit("Тестовый черновик недоступен")
    print(json.dumps(draft, ensure_ascii=False, indent=2))
    if input("Введите yes для подтверждения тестового действия: ") != "yes":
        return
    client = BuddyMCPClient(url, os.environ["BUDDY_MCP_SUBMIT_TOKEN"])
    async with client.connect(args.user_id) as session:
        result = await session.call_tool(
            f"{draft['kind']}_submit",
            {"action_id": draft["action_id"], "version": draft["version"]},
        )
        if result.isError or result.structuredContent is None:
            raise SystemExit("Ошибка отправки тестового черновика")
        submitted = result.structuredContent
        print(json.dumps(submitted, ensure_ascii=False, indent=2))
    if draft["kind"] in ("access", "absence") and "request_id" in submitted:
        async with read_client.connect(args.user_id) as session:
            saved = await session.call_tool(
                f"{draft['kind']}_get_request", {"request_id": submitted["request_id"]}
            )
            if (
                saved.isError
                or not saved.structuredContent
                or (
                    saved.structuredContent.get("request_id") != submitted["request_id"]
                )
            ):
                raise SystemExit("Не удалось прочитать результат после отправки")
            print(json.dumps(saved.structuredContent, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--action-id", required=True)
    asyncio.run(run(parser.parse_args()))
