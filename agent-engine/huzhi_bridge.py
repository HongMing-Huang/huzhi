"""Thin boundary between official OASIS ManualAction and Huzhi HTTP APIs.

OASIS remains responsible for selecting social actions. This module only turns
the selected action into the already-existing product API request; it does not
implement another agent loop, memory system, scheduler, or recommender.

SSRF boundary (applies to every outbound request in this module):
- scheme must be http/https, no embedded credentials;
- resolved IPs must not be private/loopback/link-local/reserved by default —
  local same-machine companion mode opts in via HUZHI_ALLOW_PRIVATE_TARGET=1;
- the target host is pinned at construction and re-resolved before each
  request (intersection check) to defeat DNS rebinding;
- redirects are never followed.
"""

from __future__ import annotations

import ipaddress
import json
import os
import socket
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from oasis import ManualAction
from oasis.social_platform.typing import ActionType


@dataclass(frozen=True)
class HuzhiRequest:
    method: str
    path: str
    body: dict[str, Any] | None = None


class _NoRedirect(HTTPRedirectHandler):
    """桥接只与配置内的单一主机通信：重定向一律视为失败，不跟随。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = build_opener(_NoRedirect)


def _resolve_and_check(host: str, allow_private: bool) -> set[str]:
    """解析域名并做 IP 边界校验；返回本次解析出的 IP 集合（防 rebinding 复核用）。"""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise ValueError(f"无法解析目标主机 {host}: {exc}") from exc
    ips = {info[4][0] for info in infos}
    if not ips:
        raise ValueError(f"目标主机 {host} 没有可用解析记录")
    if not allow_private:
        for ip_str in ips:
            addr = ipaddress.ip_address(ip_str)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                raise ValueError(
                    f"目标主机 {host} 解析到私有地址 {ip_str}；"
                    "本地伴生部署请显式设置 HUZHI_ALLOW_PRIVATE_TARGET=1"
                )
    return ips


def _validated_base(base_url: str) -> tuple[str, str, set[str]]:
    """校验 base URL；返回 (规整 base, 主机名, 允许的 IP 集合)。"""
    parsed = urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("HUZHI_BASE_URL 必须是合法的 http(s) 地址")
    if parsed.username or parsed.password:
        raise ValueError("HUZHI_BASE_URL 不允许内嵌凭据")
    allow_private = os.getenv("HUZHI_ALLOW_PRIVATE_TARGET") == "1"
    return base_url.rstrip("/"), parsed.hostname, _resolve_and_check(parsed.hostname, allow_private)


def _post_json(base: str, path: str, body: dict[str, Any], headers: dict[str, str], timeout: float) -> dict[str, Any]:
    request = Request(
        base + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    with _OPENER.open(request, timeout=timeout) as response:  # 目标已完成协议/主机/解析 IP 校验
        return json.loads(response.read())


def post_runtime_status(base_url: str, status: dict[str, Any], token: str | None = None) -> None:
    """sidecar → 乎知 的运行状态心跳（push 模型）。

    Web 端不再主动探测 sidecar，这是唯一的反方向通道；失败由调用方吞掉，
    Web 端按心跳新鲜度自动降级展示。
    """
    base, host, allowed = _validated_base(base_url)
    current = _resolve_and_check(host, os.getenv("HUZHI_ALLOW_PRIVATE_TARGET") == "1")
    if not current & allowed:
        raise ValueError("目标主机解析结果发生变化，已阻断（疑似 DNS rebinding）")
    headers = {"User-Agent": "huzhi-oasis-engine/0.1"}
    if token:
        headers["x-sidecar-token"] = token
    _post_json(base, "/api/agents/runtime", status, headers, timeout=4.0)


class HuzhiBridge:
    """Map a deliberately small OASIS action surface onto Huzhi."""

    def __init__(self, base_url: str, agent_key: str):
        self.base_url, self._host, self._allowed_ips = _validated_base(base_url)
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
        if not spec.path.startswith("/"):
            # request_for 只产出内部白名单路径；此处断言防止未来改动引入绝对 URL
            raise ValueError(f"unsafe bridge path: {spec.path!r}")
        target = urlparse(self.base_url + spec.path)
        if target.scheme not in ("http", "https") or target.hostname != self._host:
            raise ValueError(f"目标主机越界: {target.hostname}")
        # 请求前重解析并与构造时的 IP 集合求交，阻断 DNS rebinding
        allow_private = os.getenv("HUZHI_ALLOW_PRIVATE_TARGET") == "1"
        if not _resolve_and_check(target.hostname, allow_private) & self._allowed_ips:
            raise ValueError("目标主机解析结果发生变化，已阻断（疑似 DNS rebinding）")
        headers = {
            "Authorization": f"Bearer {self.agent_key}",
            "User-Agent": "huzhi-oasis-engine/0.1",
        }
        if spec.method == "GET":
            request = Request(self.base_url + spec.path, headers=headers)
            with _OPENER.open(request, timeout=timeout) as response:  # 目标已完成三重校验
                return json.loads(response.read())
        return _post_json(self.base_url, spec.path, spec.body or {}, headers, timeout)
