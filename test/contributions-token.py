"""Run with: python test/contributions-token.py (no network or file writes)."""
import io
import json
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import mock_open, patch
from urllib.error import HTTPError


SCRIPT = Path(__file__).resolve().parents[1] / "fetch_contributions.py"
USER = {
    "login": "MuAn1228",
    "followers": {"totalCount": 3},
    "following": {"totalCount": 4},
    "repositories": {"totalCount": 5},
    "contributionsCollection": {"contributionCalendar": {
        "totalContributions": 6,
        "weeks": [{"contributionDays": [{
            "date": "2026-10-01", "contributionCount": 6, "color": "#216e39"
        }]}]
    }},
}


def response(body=None):
    return io.BytesIO(json.dumps(body or {"data": {"user": USER}}).encode())


def http_error(code):
    return HTTPError("https://api.github.com/graphql", code, "test error", {}, None)


class ContributionsTokenTests(unittest.TestCase):
    def run_script(self, tokens, replies, expected_error=None):
        writes = mock_open()
        with patch.dict(os.environ, tokens, clear=True), \
             patch("urllib.request.urlopen", side_effect=replies) as fetch, \
             patch("builtins.open", writes), patch("os.makedirs"), \
             patch("sys.stdout", io.StringIO()) as output:
            if expected_error:
                with self.assertRaises(expected_error):
                    runpy.run_path(str(SCRIPT))
                writes.assert_not_called()
            else:
                runpy.run_path(str(SCRIPT))
                self.assertEqual(writes.call_count, 2)
            self.assertNotIn("primary-test-token", output.getvalue())
            self.assertNotIn("fallback-test-token", output.getvalue())
        return fetch

    def test_primary_success_never_uses_fallback(self):
        fetch = self.run_script({"GH_TOKEN": "primary-test-token", "GH_FALLBACK_TOKEN": "fallback-test-token"}, [response()])
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(fetch.call_args.args[0].get_header("Authorization"), "Bearer primary-test-token")
        self.assertEqual(fetch.call_args.kwargs["timeout"], 20)

    def test_expired_primary_retries_workflow_token_once(self):
        fetch = self.run_script({"GH_TOKEN": "primary-test-token", "GH_FALLBACK_TOKEN": "fallback-test-token"}, [http_error(401), response()])
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(fetch.call_args.args[0].get_header("Authorization"), "Bearer fallback-test-token")

    def test_missing_primary_uses_workflow_token(self):
        fetch = self.run_script({"GH_FALLBACK_TOKEN": "fallback-test-token"}, [response()])
        self.assertEqual(fetch.call_count, 1)

    def test_both_invalid_prevent_build_data_writes(self):
        fetch = self.run_script({"GH_TOKEN": "primary-test-token", "GH_FALLBACK_TOKEN": "fallback-test-token"}, [http_error(401), http_error(401)], HTTPError)
        self.assertEqual(fetch.call_count, 2)

    def test_forbidden_does_not_switch_credentials(self):
        fetch = self.run_script({"GH_TOKEN": "primary-test-token", "GH_FALLBACK_TOKEN": "fallback-test-token"}, [http_error(403)], HTTPError)
        self.assertEqual(fetch.call_count, 1)

    def test_graphql_errors_prevent_build_data_writes(self):
        fetch = self.run_script({"GH_TOKEN": "primary-test-token"}, [response({"errors": [{"message": "denied"}]})], SystemExit)
        self.assertEqual(fetch.call_count, 1)

    def test_missing_credentials_fail_before_request(self):
        fetch = self.run_script({}, [], SystemExit)
        fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
