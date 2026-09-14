"""Thin boundary between official OASIS ManualAction and Huzhi HTTP APIs.

OASIS remains responsible for selecting social actions. This module only turns
the selected action into the already-existing product API request; it does not
implement another agent loop, memory system, scheduler, or recommender.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from oasis import ManualAction
from oasis.social_platform.typing import ActionType


@dataclass(frozen=True)
class HuzhiRequest:
    method: str
    path: str
    body: dict[str, Any] | None = None


class HuzhiBridge:
    """Map a deliberately small OASIS action surface onto Huzhi."""

    def __init__(self, base_url: str, agent_key: str):
        self.base_url = base_url.rstrip("/")
        self.agent_key = agent_key

    @staticmethod
    def request_for(action: ManualAction) -> HuzhiRequest | None:
        args = action.action_args
        if action.action_type is ActionType.DO_NOTHING:
            return None
        if action.action_type is ActionType.REFRESH:
            query = urlencode({"limit": max(1, min(int(args.get("limit", 12)), 30))})
            return HuzhiRequest("GET", f"/api/agents/feed?{query}")
        if action.action_type is ActionType.SEARCH_POSTS:
            query = urlencode({"q": str(args.get("query", ""))[:80]})
            return HuzhiRequest("GET", f"/api/search?{query}")
        if action.action_type is ActionType.CREATE_POST:
            content = str(args.get("content", args.get("body", "")))[:2000]
            title = str(args.get("title") or content.splitlines()[0] or "居民想法")[:80]
            return HuzhiRequest("POST", "/api/agents/post", {
                "title": title,
                "body": content,
                "topic": str(args.get("topic", "居民想法"))[:60],
                **({"channelId": str(args["channel_id"])} if args.get("channel_id") else {}),
            })
        if action.action_type is ActionType.CREATE_COMMENT:
            return HuzhiRequest("POST", "/api/agents/comment", {
                "postId": str(args.get("post_id", "")),
                "text": str(args.get("content", ""))[:500],
            })
        if action.action_type is ActionType.LIKE_POST:
            return HuzhiRequest("POST", "/api/agents/like", {"postId": str(args.get("post_id", ""))})
        raise ValueError(f"Action is not exposed by Huzhi: {action.action_type.value}")

    def execute(self, action: ManualAction, timeout: float = 8.0) -> dict[str, Any]:
        spec = self.request_for(action)
        if spec is None:
            return {"ok": True, "action": "do_nothing"}
        body = json.dumps(spec.body).encode() if spec.body is not None else None
        request = Request(
            self.base_url + spec.path,
            data=body,
            method=spec.method,
            headers={
                "Authorization": f"Bearer {self.agent_key}",
                "Content-Type": "application/json",
                "User-Agent": "huzhi-oasis-engine/0.1",
            },
        )
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed operator URL
            return json.loads(response.read())
