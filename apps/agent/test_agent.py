import json
import unittest
from http import HTTPStatus
from io import BytesIO
from unittest.mock import patch

from agent.server import AgentHandler
from agent.service import _chat_completions_url, create_response


class AgentServiceTest(unittest.TestCase):
    def test_fallback_without_context(self) -> None:
        response = create_response({"message": "What is blocked?", "context": {"events": [], "documentChunks": []}})

        self.assertEqual(response["confidence"], "low")
        self.assertEqual(response["citations"], [])
        self.assertIn("did not find enough", response["answer"])

    def test_fallback_returns_ranked_citation(self) -> None:
        response = create_response(
            {
                "message": "What checks failed?",
                "context": {
                    "events": [
                        {
                            "id": "evt-1",
                            "service": "github",
                            "type": "check.failed",
                            "title": "Auth checks failed",
                            "summary": "The login suite failed.",
                            "source": "repo",
                            "occurredAt": "2026-08-08T12:00:00Z",
                        }
                    ],
                    "documentChunks": [],
                },
            }
        )

        self.assertEqual(response["citations"][0]["id"], "evt-1")
        self.assertEqual(response["citations"][0]["type"], "work_event")
        self.assertEqual(response["confidence"], "medium")

    def test_model_response_citations_are_constrained_to_context(self) -> None:
        model_response = {
            "answer": "Use the GitHub event.",
            "citations": [{"type": "work_event", "id": "evt-1"}, {"type": "work_event", "id": "leak"}],
            "suggestedActions": [{"label": "Open checks", "kind": "inspect"}],
            "confidence": "high",
            "model": "unit-model",
        }

        with patch.dict(
            "os.environ",
            {
                "AGENT_MODEL_BASE_URL": "https://api.groq.com/openai/v1",
                "AGENT_MODEL": "unit-model",
                "AGENT_MODEL_API_KEY": "model-secret",
            },
        ):
            with patch("urllib.request.urlopen") as urlopen:
                urlopen.return_value.__enter__.return_value.read.return_value = json.dumps(
                    {"choices": [{"message": {"content": json.dumps(model_response)}}]}
                ).encode("utf-8")
                response = create_response(
                    {
                        "message": "What checks failed?",
                        "context": {
                            "events": [
                                {
                                    "id": "evt-1",
                                    "service": "github",
                                    "type": "check.failed",
                                    "title": "Auth checks failed",
                                    "summary": "The login suite failed.",
                                    "source": "repo",
                                    "occurredAt": "2026-08-08T12:00:00Z",
                                }
                            ],
                            "documentChunks": [],
                        },
                    }
                )
                request = urlopen.call_args.args[0]

        self.assertEqual(response["model"], "unit-model")
        self.assertEqual(request.full_url, "https://api.groq.com/openai/v1/chat/completions")
        self.assertEqual(request.headers["Authorization"], "Bearer model-secret")
        self.assertEqual(response["citations"], [{
            "type": "work_event",
            "id": "evt-1",
            "service": "github",
            "title": "Auth checks failed",
            "url": "",
        }])

    def test_chat_completions_url_supports_v1_and_root_base_urls(self) -> None:
        self.assertEqual(
            _chat_completions_url("https://api.groq.com/openai/v1"),
            "https://api.groq.com/openai/v1/chat/completions",
        )
        self.assertEqual(
            _chat_completions_url("https://api.groq.com/openai/v1/chat"),
            "https://api.groq.com/openai/v1/chat/completions",
        )
        self.assertEqual(
            _chat_completions_url("https://api.groq.com/openai/v1/chat/completions"),
            "https://api.groq.com/openai/v1/chat/completions",
        )
        self.assertEqual(
            _chat_completions_url("http://localhost:11434"),
            "http://localhost:11434/v1/chat/completions",
        )


class AgentHandlerTest(unittest.TestCase):
    def test_post_requires_secret_when_configured(self) -> None:
        with patch.dict("os.environ", {"AGENT_SERVICE_SECRET": "secret"}):
            handler = object.__new__(AgentHandler)
            handler.path = "/v1/chat"
            handler.headers = {}
            handler.command = "POST"
            handler.request_version = "HTTP/1.1"
            handler.responses = {HTTPStatus.UNAUTHORIZED: ("Unauthorized", "")}
            handler.wfile = BytesIO()
            handler.send_response = lambda status: setattr(handler, "status", status)
            handler.send_header = lambda key, value: None
            handler.end_headers = lambda: None

            handler.do_POST()

        self.assertEqual(handler.status, 401)


if __name__ == "__main__":
    unittest.main()
