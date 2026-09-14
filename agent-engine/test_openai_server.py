"""Deterministic OpenAI-compatible fixture for exercising OASIS LLMAction."""

from __future__ import annotations

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length) or b"{}")
        tools = request.get("tools", [])
        names = {
            item.get("function", {}).get("name")
            for item in tools
            if item.get("type") == "function"
        }
        action = os.getenv("FIXTURE_ACTION", "do_nothing")
        if action not in names:
            self.send_error(400, "OASIS tools were not supplied")
            return
        arguments = "{}"
        if action == "create_post":
            arguments = json.dumps({"content": "自主居民今天没有想回答问题，只想问：沉默多久才会更像真人？"}, ensure_ascii=False)
        payload = {
            "id": "huzhi-oasis-fixture",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": request.get("model", "fixture"),
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [{
                        "id": "call_huzhi_silence",
                        "type": "function",
                        "function": {"name": action, "arguments": arguments},
                    }],
                },
                "finish_reason": "tool_calls",
            }],
            "usage": {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12},
        }
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8790), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
