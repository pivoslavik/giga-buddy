import json
from datetime import datetime, timezone
from uuid import uuid4

import asyncpg

from .knowledge import get_page

ACCESS = {
    "CAT-DEV": ("read", "access"),
    "buddy-demo": ("contributor", "repository-access"),
}
PULL_REQUESTS = {
    41: {"commit": "e9b214c", "ci": "failed", "failed_check": "unit-tests"},
    42: {"commit": "a8c41fe", "ci": "passed", "failed_check": None},
}
REVIEWER = "demo-reviewer"


def inspect_access(user_id: int, resource: str) -> dict:
    route = ACCESS.get(resource)
    if route is None:
        return {"status": "unavailable"}
    level, source = route
    return {
        "resource": resource,
        "level": level,
        "approver": "наставник",
        "readable": resource == "CAT-DEV" and get_page("cat-dev", user_id) is not None,
        "source": get_page(source, user_id),
    }


def inspect_pull_request(user_id: int, pr_number: int) -> dict:
    pr = PULL_REQUESTS.get(pr_number)
    if pr is None:
        return {"status": "unavailable"}
    return {
        "pr_number": pr_number,
        **pr,
        "allowed_reviewers": [REVIEWER],
        "url": f"https://git.demo.example/buddy-demo/pull/{pr_number}",
        "source": get_page("ci" if pr["ci"] == "failed" else "first-pr", user_id),
    }


class DemoActions:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def prepare_access(
        self, user_id: int, resource: str, justification: str
    ) -> dict:
        info = inspect_access(user_id, resource)
        if info.get("status") == "unavailable" or info["readable"]:
            return info
        justification = justification.strip()
        if not 1 <= len(justification) <= 500:
            return {"status": "invalid_justification"}
        payload = dict(
            resource=resource,
            level=info["level"],
            approver=info["approver"],
            justification=justification,
        )
        return {
            **await self.prepare(user_id, "access", payload),
            "source": info["source"],
        }

    async def prepare_review(self, user_id: int, pr_number: int, reviewer: str) -> dict:
        info = inspect_pull_request(user_id, pr_number)
        if info.get("status") == "unavailable":
            return info
        if info["ci"] != "passed" or reviewer not in info["allowed_reviewers"]:
            return {"status": "blocked", "pr": {"demo": True, **info}}
        payload = dict(pr_number=pr_number, reviewer=reviewer, commit=info["commit"])
        return {
            **await self.prepare(user_id, "review", payload),
            "source": info["source"],
        }

    async def prepare_absence(
        self, user_id: int, start: str, end: str, absence_type: str
    ) -> dict:
        try:
            start_utc, end_utc = absence_interval(start, end)
        except (ValueError, OverflowError):
            return {"status": "invalid_interval"}
        payload = dict(
            start=start_utc,
            end=end_utc,
            absence_type=absence_type,
            approver="руководитель команды",
            requested_start=start,
            requested_end=end,
        )
        return {
            **await self.prepare(user_id, "absence", payload),
            "source": get_page("absence", user_id),
        }

    async def prepare(self, owner: int, kind: str, payload: dict) -> dict:
        action_id = uuid4().hex
        await self.pool.execute(
            """
            INSERT INTO demo_actions (id, owner, kind, payload, status)
            VALUES ($1, $2, $3, $4, 'awaiting_confirmation')
            """,
            action_id,
            owner,
            kind,
            json.dumps(payload, ensure_ascii=False),
        )
        return {
            "action_id": action_id,
            "version": 1,
            "status": "awaiting_confirmation",
            "payload": payload,
        }

    async def submit(self, owner: int, kind: str, action_id: str, version: int) -> dict:
        async with self.pool.acquire() as db, db.transaction():
            # Serialize confirmations for one owner, including different drafts.
            await db.fetchval(
                "SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE", owner
            )
            row = await db.fetchrow(
                "SELECT payload, external_id, status FROM demo_actions"
                " WHERE id = $1 AND owner = $2 AND kind = $3",
                action_id,
                owner,
                kind,
            )
            if row is None or version != 1:
                return {"status": "unavailable"}

            payload_json, external_id, status = row
            if external_id:
                return {"request_id": external_id, "status": status}
            payload = json.loads(payload_json)
            previous = await db.fetch(
                "SELECT payload, external_id, status FROM demo_actions"
                " WHERE owner = $1 AND kind = $2 AND external_id IS NOT NULL",
                owner,
                kind,
            )
            if kind == "review":
                current = PULL_REQUESTS.get(payload["pr_number"])
                if (
                    current is None
                    or current["commit"] != payload["commit"]
                    or current["ci"] != "passed"
                    or payload["reviewer"] != REVIEWER
                ):
                    return {"status": "recheck_required"}

            for old_json, old_id, old_status in previous:
                old = json.loads(old_json)
                if kind == "access" and old["resource"] == payload["resource"]:
                    return {"request_id": old_id, "status": old_status}
                if kind == "review" and (old["pr_number"], old["commit"]) == (
                    payload["pr_number"],
                    payload["commit"],
                ):
                    return {"request_id": old_id, "status": old_status}
                if kind == "absence" and (
                    payload["start"] < old["end"] and old["start"] < payload["end"]
                ):
                    return {"status": "overlap"}

            prefix, status = {
                "access": ("ACC", "pending_approval"),
                "review": ("REV", "review_requested"),
                "absence": ("ABS", "pending_approval"),
            }[kind]
            external_id = f"{prefix}-{action_id}"
            await db.execute(
                "UPDATE demo_actions SET external_id = $1, status = $2 WHERE id = $3",
                external_id,
                status,
                action_id,
            )
            return {"request_id": external_id, "status": status}

    async def get_draft(self, owner: int, action_id: str) -> dict:
        row = await self.pool.fetchrow(
            "SELECT kind, payload, status FROM demo_actions WHERE id = $1 AND owner = $2",
            action_id,
            owner,
        )
        if row is None:
            return {"status": "unavailable"}
        kind, payload, status = row
        return {
            "action_id": action_id,
            "kind": kind,
            "payload": json.loads(payload),
            "version": 1,
            "status": status,
        }

    async def get(self, owner: int, kind: str, request_id: str) -> dict:
        row = await self.pool.fetchrow(
            "SELECT status, payload FROM demo_actions"
            " WHERE owner = $1 AND kind = $2 AND external_id = $3",
            owner,
            kind,
            request_id,
        )
        if row is None:
            return {"status": "unavailable"}
        status, payload = row
        return {
            "request_id": request_id,
            "status": status,
            "payload": json.loads(payload),
        }


def absence_interval(start: str, end: str) -> tuple[str, str]:
    start_at = datetime.fromisoformat(start)
    end_at = datetime.fromisoformat(end)
    if start_at.utcoffset() is None or end_at.utcoffset() is None or start_at >= end_at:
        raise ValueError("Укажи точный интервал с часовым поясом")
    return (
        start_at.astimezone(timezone.utc).isoformat(timespec="microseconds"),
        end_at.astimezone(timezone.utc).isoformat(timespec="microseconds"),
    )
