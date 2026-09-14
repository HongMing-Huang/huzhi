"""Fail-fast proof that the pinned OASIS runtime exposes the APIs Huzhi uses."""

from importlib.metadata import version

from oasis import ManualAction
from oasis.social_platform.typing import ActionType

REQUIRED_ACTIONS = {"refresh", "search_posts", "create_post", "like_post", "create_comment"}


def main() -> None:
    actions = {action.value for action in ActionType}
    missing = REQUIRED_ACTIONS - actions
    if missing:
        raise RuntimeError(f"OASIS action contract changed; missing: {sorted(missing)}")
    print({
        "camel_oasis": version("camel-oasis"),
        "camel_ai": version("camel-ai"),
        "mcp": version("mcp"),
        "manual_action": ManualAction.__name__,
        "required_actions": sorted(REQUIRED_ACTIONS),
    })


if __name__ == "__main__":
    main()
