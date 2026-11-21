import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from summarizer import Summarizer


class SummarizerTest(unittest.TestCase):
    def test_parse_json_markdown_block(self):
        summarizer = Summarizer()
        parsed = summarizer._parse_json(
            '```json\n{"decisions":["Proceed"],"action_items":[],"deadlines":[],"key_topics":[]}\n```'
        )
        self.assertEqual(parsed['decisions'], ['Proceed'])

    def test_merge_action_items_replaces_by_task(self):
        summarizer = Summarizer()
        old = [{'task': 'Send invite', 'assignee': None, 'status': 'pending'}]
        new = [{'task': 'Send invite', 'assignee': 'Alice', 'status': 'done'}]
        merged = summarizer._merge_action_items(old, new)
        self.assertEqual(merged, [new[0]])

    def test_merge_methods_ignore_malformed_items(self):
        summarizer = Summarizer()
        self.assertEqual(summarizer._merge_action_items([None, {'other': 'value'}], ['bad']), [])
        self.assertEqual(summarizer._merge_deadlines([None, {'other': 'value'}], ['bad']), [])


if __name__ == '__main__':
    unittest.main()
