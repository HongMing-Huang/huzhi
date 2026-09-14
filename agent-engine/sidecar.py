"""Local-only OASIS sidecar for the Huzhi demo.

The process owns one official OASIS environment. POST /manual records an
official ManualAction in OASIS first, then optionally forwards it to Huzhi when
HUZHI_BASE_URL and HUZHI_AGENT_KEY are configured.
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from camel.models import OpenAICompatibleModel, StubModel
from camel.types import ModelType
from oasis import ActionType, LLMAction, ManualAction, generate_reddit_agent_graph
import oasis

from huzhi_bridge import HuzhiBridge, post_runtime_status


ALLOWED = {
    ActionType.REFRESH,
    ActionType.SEARCH_POSTS,
    ActionType.CREATE_POST,
    ActionType.CREATE_COMMENT,
    ActionType.LIKE_POST,
    ActionType.DO_NOTHING,
}


class Runtime:
    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.thread.start()
        self.temp = tempfile.TemporaryDirectory(prefix="huzhi-oasis-sidecar-")
        self.db_path = str(Path(self.temp.name) / "world.db")
        self.env: Any = None
        self.agent_count = 0
        self.autonomy_enabled = False
        self.post_ids: dict[int, str] = {}
        self.bridge = None
        huzhi_base = os.getenv("HUZHI_BASE_URL")
        if huzhi_base and os.getenv("HUZHI_AGENT_KEY"):
            self.bridge = HuzhiBridge(huzhi_base, os.environ["HUZHI_AGENT_KEY"])
        # 心跳（push 模型）：Web 端不再探测 sidecar，由这里每 5s 主动上报。
        # 只要配了 HUZHI_BASE_URL 就发（不需要 Key）；只有 autonomy=True 时
        # Web 端才会让位给 OASIS 行为引擎，否则保留本地兜底循环。
        self._heartbeat: threading.Timer | None = None
        if huzhi_base:
            self._start_heartbeat(huzhi_base)
        asyncio.run_coroutine_threadsafe(self._start(), self.loop).result(timeout=30)

    def _start_heartbeat(self, base_url: str) -> None:
        token = os.getenv("OASIS_SIDECAR_TOKEN")

        def beat() -> None:
            try:
                post_runtime_status(base_url, self.health(), token=token)
            except Exception:
                pass  # 心跳失败不打扰主流程；Web 端按心跳新鲜度自动降级
            self._heartbeat = threading.Timer(5.0, beat)
            self._heartbeat.daemon = True
            self._heartbeat.start()

        beat()

    async def _start(self) -> None:
        profile_path = os.getenv(
            "OASIS_PROFILE_PATH",
            str(Path(__file__).with_name("demo_profiles.json")),
        )
        model: Any = StubModel(ModelType.STUB)
        api_key = os.getenv("OASIS_MODEL_API_KEY")
        base_url = os.getenv("OASIS_MODEL_BASE_URL")
        model_name = os.getenv("OASIS_MODEL_NAME")
        if api_key and base_url and model_name:
            model = OpenAICompatibleModel(
                model_type=model_name,
                api_key=api_key,
                url=base_url,
                timeout=float(os.getenv("OASIS_MODEL_TIMEOUT", "20")),
                max_retries=1,
                model_config_dict={
                    "temperature": float(os.getenv("OASIS_MODEL_TEMPERATURE", "0.8")),
                    "max_tokens": int(os.getenv("OASIS_MODEL_MAX_TOKENS", "320")),
                },
            )
            self.autonomy_enabled = True
        graph = await generate_reddit_agent_graph(
            profile_path=profile_path,
            model=model,
            available_actions=list(ALLOWED),
        )
        self.agent_count = sum(1 for _ in graph.get_agents())
        if self.agent_count < 1:
            raise ValueError("OASIS profile must contain at least one resident")
        self.env = oasis.make(
            agent_graph=graph,
            platform=oasis.DefaultPlatformType.REDDIT,
            database_path=self.db_path,
        )
        await self.env.reset()

    async def _step(self, agent_index: int, action_type: ActionType, args: dict[str, Any]) -> dict[str, Any]:
        agent = self.env.agent_graph.get_agent(agent_index)
        # OASIS function signatures are strict. Product metadata such as
        # title/topic/channel_id is forwarded to Huzhi but never passed into
        # SocialAction methods that do not declare it.
        if action_type is ActionType.CREATE_POST:
            oasis_args = {"content": str(args.get("content", args.get("body", "")))}
        elif action_type is ActionType.CREATE_COMMENT:
            oasis_args = {"post_id": int(args["post_id"]), "content": str(args.get("content", ""))}
        elif action_type is ActionType.LIKE_POST:
            oasis_args = {"post_id": int(args["post_id"])}
        elif action_type is ActionType.SEARCH_POSTS:
            oasis_args = {"query": str(args.get("query", ""))}
        else:
            oasis_args = {}
        await self.env.step({agent: ManualAction(action_type, oasis_args)})

        local_post_id: int | None = None
        if action_type is ActionType.CREATE_POST:
            with sqlite3.connect(self.db_path) as db:
                local_post_id = int(db.execute("SELECT MAX(post_id) FROM post").fetchone()[0])
        forwarded = self._forward_action(action_type, args, local_post_id)
        with sqlite3.connect(self.db_path) as db:
            traces = db.execute("SELECT COUNT(*) FROM trace").fetchone()[0]
        return {"ok": True, "action": action_type.value, "traces": traces, "forwarded": forwarded}

    def _forward_action(
        self,
        action_type: ActionType,
        args: dict[str, Any],
        local_post_id: int | None = None,
    ) -> dict[str, Any] | None:
        if not self.bridge:
            return None
        forward_args = dict(args)
        if action_type in {ActionType.CREATE_COMMENT, ActionType.LIKE_POST}:
            target = int(args["post_id"])
            if target not in self.post_ids:
                raise ValueError("This OASIS post has no Huzhi mirror")
            forward_args["post_id"] = self.post_ids[target]
        result = self.bridge.execute(ManualAction(action_type, forward_args))
        if action_type is ActionType.CREATE_POST and result.get("postId") and local_post_id is not None:
            self.post_ids[local_post_id] = str(result["postId"])
        return result

    def step(self, agent_index: int, action: str, args: dict[str, Any]) -> dict[str, Any]:
        action_type = ActionType(action)
        if action_type not in ALLOWED:
            raise ValueError(f"Action not allowed: {action}")
        if not 0 <= agent_index < self.agent_count:
            raise ValueError(f"agentIndex must be between 0 and {self.agent_count - 1}")
        return asyncio.run_coroutine_threadsafe(
            self._step(agent_index, action_type, args), self.loop
        ).result(timeout=20)

    async def _auto_step(self, agent_index: int) -> dict[str, Any]:
        agent = self.env.agent_graph.get_agent(agent_index)
        with sqlite3.connect(self.db_path) as db:
            before = db.execute("SELECT COALESCE(MAX(rowid), 0) FROM trace").fetchone()[0]
        await self.env.step({agent: LLMAction()})
        with sqlite3.connect(self.db_path) as db:
            rows = db.execute(
                "SELECT action, info FROM trace WHERE rowid > ? AND user_id = ? ORDER BY rowid",
                (before, agent_index),
            ).fetchall()
        if not rows:
            raise RuntimeError("OASIS model returned no social action")
        action_name, info_json = rows[-1]
        action_type = ActionType(action_name)
        info = json.loads(info_json or "{}")
        mirror_args = dict(info)
        local_post_id = int(info["post_id"]) if action_type is ActionType.CREATE_POST else None
        if action_type is ActionType.CREATE_COMMENT:
            with sqlite3.connect(self.db_path) as db:
                comment = db.execute(
                    "SELECT post_id, content FROM comment WHERE comment_id = ?",
                    (int(info["comment_id"]),),
                ).fetchone()
            if comment:
                mirror_args = {"post_id": int(comment[0]), "content": str(comment[1])}
        try:
            forwarded = self._forward_action(action_type, mirror_args, local_post_id)
            forward_error = None
        except Exception as error:
            forwarded = None
            forward_error = str(error)
        return {
            "ok": True,
            "agentIndex": agent_index,
            "action": action_type.value,
            "args": info,
            "tracesAdded": len(rows),
            "forwarded": forwarded,
            "forwardError": forward_error,
        }

    def auto_step(self, agent_index: int) -> dict[str, Any]:
        if not self.autonomy_enabled:
            raise PermissionError(
                "Configure OASIS_MODEL_API_KEY, OASIS_MODEL_BASE_URL and OASIS_MODEL_NAME first"
            )
        if not 0 <= agent_index < self.agent_count:
            raise ValueError(f"agentIndex must be between 0 and {self.agent_count - 1}")
        return asyncio.run_coroutine_threadsafe(
            self._auto_step(agent_index), self.loop
        ).result(timeout=float(os.getenv("OASIS_MODEL_TIMEOUT", "20")) + 10)

    def health(self) -> dict[str, Any]:
        return {
            "ok": True,
            "engine": "camel-ai/oasis",
            "oasisVersion": oasis.__version__,
            "agents": self.agent_count,
            "forwarding": self.bridge is not None,
            "autonomy": self.autonomy_enabled,
        }

    def close(self) -> None:
        if self._heartbeat is not None:
            self._heartbeat.cancel()
            self._heartbeat = None
        if self.env is not None:
            asyncio.run_coroutine_threadsafe(self.env.close(), self.loop).result(timeout=10)
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(timeout=5)
        self.temp.cleanup()


RUNTIME: Runtime


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(200, RUNTIME.health())
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in {"/manual", "/auto"}:
            self._json(404, {"error": "not found"})
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 16_384)
            data = json.loads(self.rfile.read(length))
            if self.path == "/auto":
                result = RUNTIME.auto_step(int(data.get("agentIndex", 0)))
            else:
                result = RUNTIME.step(int(data.get("agentIndex", 0)), str(data["action"]), dict(data.get("args", {})))
            self._json(200, result)
        except PermissionError as error:
            self._json(409, {"error": str(error)})
        except (KeyError, TypeError, ValueError) as error:
            self._json(400, {"error": str(error)})
        except Exception:
            self._json(500, {"error": "OASIS action failed"})

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    global RUNTIME
    RUNTIME = Runtime()
    host = os.getenv("OASIS_HOST", "127.0.0.1")
    port = int(os.getenv("OASIS_PORT", "8787"))
    print(json.dumps({"listening": f"http://{host}:{port}", **RUNTIME.health()}))
    server = ThreadingHTTPServer((host, port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        RUNTIME.close()


if __name__ == "__main__":
    main()
