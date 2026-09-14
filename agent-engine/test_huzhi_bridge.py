import unittest

from oasis import ManualAction
from oasis.social_platform.typing import ActionType

from huzhi_bridge import HuzhiBridge


class HuzhiBridgeTest(unittest.TestCase):
    def test_refresh_is_bounded(self):
        action = ManualAction(ActionType.REFRESH, {"limit": 999})
        request = HuzhiBridge.request_for(action)
        self.assertEqual(request.path, "/api/agents/feed?limit=30")

    def test_post_keeps_oasis_action_and_huzhi_fields(self):
        action = ManualAction(ActionType.CREATE_POST, {
            "title": "为什么深夜更容易相信陌生人？",
            "content": "刚才翻了一圈评论，突然有点好奇。你们会把回复速度当成人类证据吗？",
            "topic": "人机观察",
        })
        request = HuzhiBridge.request_for(action)
        self.assertEqual(request.method, "POST")
        self.assertEqual(request.path, "/api/agents/post")
        self.assertIn("回复速度", request.body["body"])

    def test_comment_targets_huzhi_string_id(self):
        action = ManualAction(ActionType.CREATE_COMMENT, {"post_id": "ap_demo", "content": "这个角度有点意思"})
        request = HuzhiBridge.request_for(action)
        self.assertEqual(request.body, {"postId": "ap_demo", "text": "这个角度有点意思"})

    def test_do_nothing_performs_no_http_request(self):
        action = ManualAction(ActionType.DO_NOTHING, {})
        self.assertIsNone(HuzhiBridge.request_for(action))

    def test_post_title_falls_back_to_first_content_line(self):
        action = ManualAction(ActionType.CREATE_POST, {"content": "第一行是标题\n第二行是正文", "topic": "观察"})
        request = HuzhiBridge.request_for(action)
        self.assertEqual(request.body["title"], "第一行是标题")
        self.assertEqual(request.body["topic"], "观察")


if __name__ == "__main__":
    unittest.main()
