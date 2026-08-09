import json
import unittest
from datetime import datetime, timezone, timedelta
from http import HTTPStatus
from io import BytesIO
from unittest.mock import patch

from agent.server import AgentHandler
from agent.service import _chat_completions_url, _clean_answer, _rank_citations, create_response


class AgentServiceTest(unittest.TestCase):
    def test_fallback_without_context(self) -> None:
        response = create_response({"message": "What is blocked?", "context": {"events": [], "documentChunks": []}})

        self.assertEqual(response["confidence"], "low")
        self.assertEqual(response["citations"], [])
        self.assertIn("não encontrei contexto suficiente", response["answer"].lower())

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
        self.assertIn("Não consegui fechar uma resposta direta", response["answer"])
        self.assertEqual(response["suggestedActions"], [])

    def test_computed_response_counts_merged_prs_today(self) -> None:
        now = datetime.now(timezone.utc)
        response = create_response(
            {
                "message": "quantas PRs mergeamos hoje?",
                "context": {
                    "queryUnderstanding": {
                        "services": ["github"],
                        "serviceMode": "source",
                        "intents": ["pull_request"],
                        "timeWindow": "today",
                        "language": "pt-BR",
                    },
                    "events": [
                        {
                            "id": "merged-1",
                            "service": "github",
                            "type": "pull_request.merged",
                            "title": "#19 Configure Groq model provider",
                            "summary": "A pull request was merged into the codebase.",
                            "source": "GitHub",
                            "occurredAt": now.isoformat(),
                        },
                        {
                            "id": "merged-2",
                            "service": "github",
                            "type": "pull_request.merged",
                            "title": "#18 Build detail timeline",
                            "summary": "A pull request was merged into the codebase.",
                            "source": "GitHub",
                            "occurredAt": (now - timedelta(hours=2)).isoformat(),
                        },
                        {
                            "id": "old-merged",
                            "service": "github",
                            "type": "pull_request.merged",
                            "title": "#17 Rebuild Today",
                            "summary": "A pull request was merged into the codebase.",
                            "source": "GitHub",
                            "occurredAt": (now - timedelta(days=2)).isoformat(),
                        },
                    ],
                    "documentChunks": [],
                },
            }
        )

        self.assertEqual(response["model"], "computed-agent")
        self.assertEqual(response["answer"], "Hoje, 2 PRs foram mergeadas.")
        self.assertEqual([citation["id"] for citation in response["citations"]], ["merged-1", "merged-2"])

    def test_computed_response_reports_zero_merged_prs(self) -> None:
        response = create_response(
            {
                "message": "quantas PRs mergeamos hoje?",
                "context": {
                    "queryUnderstanding": {
                        "intents": ["pull_request"],
                        "timeWindow": "today",
                    },
                    "events": [],
                    "documentChunks": [],
                },
            }
        )

        self.assertEqual(response["model"], "computed-agent")
        self.assertIn("não encontrei PRs mergeadas", response["answer"])
        self.assertEqual(response["citations"], [])

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

    def test_rank_citations_prioritizes_explicit_service_intent(self) -> None:
        citations = _rank_citations(
            "o que foi decidido no Slack?",
            [
                {
                    "id": "jira-1",
                    "service": "jira",
                    "title": "Ticket mentions Slack rollout",
                    "summary": "Slack appears in this Jira ticket.",
                    "source": "Jira",
                    "occurredAt": "2026-08-08T12:05:00Z",
                },
                {
                    "id": "slack-1",
                    "service": "slack",
                    "title": "Release scope decision",
                    "summary": "The team decided to hold release scope.",
                    "source": "#release",
                    "occurredAt": "2026-08-08T12:00:00Z",
                },
            ],
            [],
        )

        self.assertEqual(citations[0]["service"], "slack")

    def test_rank_citations_allows_topic_queries_across_services(self) -> None:
        citations = _rank_citations(
            "o que temos sobre Slack Connect?",
            [
                {
                    "id": "jira-1",
                    "service": "jira",
                    "title": "Plano sobre Slack Connect",
                    "summary": "Ticket com detalhes do rollout.",
                    "source": "Jira",
                    "occurredAt": "2026-08-08T12:05:00Z",
                },
                {
                    "id": "slack-1",
                    "service": "slack",
                    "title": "Mensagem operacional",
                    "summary": "Sem relação direta.",
                    "source": "#ops",
                    "occurredAt": "2026-08-08T12:00:00Z",
                },
            ],
            [],
        )

        self.assertEqual(citations[0]["id"], "jira-1")

    def test_clean_answer_removes_boilerplate_and_clips_long_output(self) -> None:
        answer = _clean_answer("Com base no contexto fornecido, " + ("detalhe " * 100))

        self.assertNotIn("Com base no contexto fornecido", answer)
        self.assertLessEqual(len(answer), 450)


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
