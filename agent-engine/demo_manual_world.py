"""Run a zero-LLM, two-resident OASIS world and assert persisted outcomes."""

from __future__ import annotations

import asyncio
import sqlite3
import tempfile
from pathlib import Path

import oasis
from camel.models import StubModel
from camel.types import ModelType
from oasis import ActionType, ManualAction, generate_reddit_agent_graph


async def run() -> dict[str, int]:
    profile_path = Path(__file__).with_name("demo_profiles.json")
    actions = [
        ActionType.CREATE_POST,
        ActionType.CREATE_COMMENT,
        ActionType.LIKE_POST,
        ActionType.REFRESH,
        ActionType.SEARCH_POSTS,
        ActionType.DO_NOTHING,
    ]
    graph = await generate_reddit_agent_graph(
        profile_path=str(profile_path),
        # Official CAMEL test backend prevents SocialAgent from implicitly
        # constructing an OpenAI client. ManualAction never invokes it.
        model=StubModel(ModelType.STUB),
        available_actions=actions,
    )

    with tempfile.TemporaryDirectory(prefix="huzhi-oasis-") as temp_dir:
        db_path = str(Path(temp_dir) / "world.db")
        env = oasis.make(
            agent_graph=graph,
            platform=oasis.DefaultPlatformType.REDDIT,
            database_path=db_path,
        )
        await env.reset()
        first = env.agent_graph.get_agent(0)
        second = env.agent_graph.get_agent(1)

        await env.step({
            first: ManualAction(ActionType.CREATE_POST, {
                "content": "你会因为回复太快，就怀疑对方不是人吗？",
            }),
            second: ManualAction(ActionType.DO_NOTHING, {}),
        })
        await env.step({
            first: ManualAction(ActionType.DO_NOTHING, {}),
            second: [
                ManualAction(ActionType.CREATE_COMMENT, {
                    "post_id": 1,
                    "content": "不会，深夜失眠的人也回得很快。",
                }),
                ManualAction(ActionType.LIKE_POST, {"post_id": 1}),
            ],
        })
        await env.close()

        with sqlite3.connect(db_path) as db:
            result = {
                "users": db.execute("SELECT COUNT(*) FROM user").fetchone()[0],
                "posts": db.execute("SELECT COUNT(*) FROM post").fetchone()[0],
                "comments": db.execute("SELECT COUNT(*) FROM comment").fetchone()[0],
                "likes": db.execute('SELECT COUNT(*) FROM "like"').fetchone()[0],
                "traces": db.execute("SELECT COUNT(*) FROM trace").fetchone()[0],
            }
    expected = {"users": 2, "posts": 1, "comments": 1, "likes": 1}
    for key, value in expected.items():
        if result[key] != value:
            raise RuntimeError(f"OASIS demo contract failed: {key}={result[key]}, expected {value}")
    return result


if __name__ == "__main__":
    print(asyncio.run(run()))
