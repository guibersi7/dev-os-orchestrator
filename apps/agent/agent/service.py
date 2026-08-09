import json
import os
import re
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Any


def create_response(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message", "")).strip()
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    events = _list(context.get("events"))
    chunks = _list(context.get("documentChunks"))
    understanding = context.get("queryUnderstanding") if isinstance(context.get("queryUnderstanding"), dict) else {}
    citations = _rank_citations(message, events, chunks)

    computed_response = _computed_response(message, events, chunks, citations, understanding)
    if computed_response:
        return computed_response

    model_response = _call_model(message, events, chunks, citations, understanding)
    if model_response:
        return _normalize_model_response(model_response, citations)

    return _fallback_response(message, citations, understanding)


def _computed_response(
    message: str,
    events: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    understanding: dict[str, Any],
) -> dict[str, Any] | None:
    del chunks
    lowered = message.lower()
    if not _asks_count(lowered):
        return None

    intents = set(_list_of_strings(understanding.get("intents")))
    time_window = str(understanding.get("timeWindow") or _message_time_window(lowered))
    matching_events = events

    if "pull_request" in intents or "pr" in lowered or "prs" in lowered:
        matching_events = [event for event in matching_events if _is_pull_request_event(event)]
    if _mentions_merged(lowered):
        matching_events = [event for event in matching_events if _is_merged_pull_request(event)]
    if time_window != "recent":
        matching_events = [event for event in matching_events if _matches_time_window(event.get("occurredAt"), time_window)]

    if not matching_events and ("pull_request" in intents or "pr" in lowered or "prs" in lowered):
        return {
            "answer": _count_answer(0, lowered, time_window),
            "citations": [],
            "suggestedActions": [{"label": "Sincronizar GitHub", "kind": "sync"}],
            "confidence": "medium",
            "model": "computed-agent",
        }

    if not matching_events:
        return None

    allowed_ids = {str(event.get("id", "")) for event in matching_events}
    scoped_citations = [citation for citation in citations if citation["id"] in allowed_ids][:3]
    return {
        "answer": _count_answer(len(matching_events), lowered, time_window),
        "citations": scoped_citations,
        "suggestedActions": [{"label": "Ver PRs mergeadas", "kind": "inspect"}],
        "confidence": "high",
        "model": "computed-agent",
    }


def _call_model(
    message: str,
    events: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    understanding: dict[str, Any],
) -> dict[str, Any] | None:
    base_url = os.getenv("AGENT_MODEL_BASE_URL", "").rstrip("/")
    if not base_url:
        return None

    model = os.getenv("AGENT_MODEL", "openai/gpt-oss-20b")
    api_key = os.getenv("AGENT_MODEL_API_KEY", "").strip()
    timeout = float(os.getenv("AGENT_TIMEOUT_SECONDS", "20"))
    prompt = {
        "role": "user",
        "content": (
            "Responda à pergunta usando somente o contexto fornecido. "
            "Siga a queryUnderstanding: serviceMode='source' significa buscar eventos da fonte citada; "
            "serviceMode='topic' significa buscar itens sobre o assunto, mesmo em outras ferramentas. "
            "Responda em pt-BR quando a pergunta estiver em português. Seja amigável, direto e conciso. "
            "O campo answer deve ter no máximo 450 caracteres, com 2 a 4 frases curtas. "
            "Não use frases como 'com base no contexto fornecido'. "
            "Se faltarem evidências, diga o que está faltando sincronizar ou confirmar. "
            "Retorne apenas JSON compacto com answer, citations, suggestedActions, confidence e model.\n\n"
            f"Pergunta: {message}\n\n"
            f"QueryUnderstanding: {json.dumps(understanding, default=str)}\n\n"
            f"Context: {json.dumps({'events': events, 'documentChunks': chunks}, default=str)}\n\n"
            f"Allowed citations: {json.dumps(citations, default=str)}"
        ),
    }
    request_payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Você é o agente do Standup. Fale como um assistente de trabalho: claro, humano e objetivo. "
                    "Nunca invente fatos, fontes ou ações executadas. A UI exibirá as citações separadamente."
                ),
            },
            prompt,
        ],
        "temperature": 0.2,
    }

    body = json.dumps(request_payload).encode("utf-8")
    headers = {"content-type": "application/json"}
    if api_key:
        headers["authorization"] = "Bearer " + api_key
    request = urllib.request.Request(
        _chat_completions_url(base_url),
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    if not isinstance(content, str) or not content.strip():
        return None

    try:
        return json.loads(_strip_json_fence(content))
    except json.JSONDecodeError:
        return {"answer": content}


def _normalize_model_response(response: dict[str, Any], allowed_citations: list[dict[str, Any]]) -> dict[str, Any]:
    allowed_by_key = {(item["type"], item["id"]): item for item in allowed_citations}
    citations = []
    for citation in _list(response.get("citations")):
        key = (citation.get("type"), citation.get("id"))
        if key in allowed_by_key:
            citations.append(allowed_by_key[key])
    if not citations:
        citations = allowed_citations[:3]

    return {
        "answer": _clean_answer(str(response.get("answer") or "Não encontrei contexto suficiente para responder com segurança.").strip()),
        "citations": citations,
        "suggestedActions": _suggested_actions(response.get("suggestedActions")),
        "confidence": str(response.get("confidence") or ("medium" if citations else "low")),
        "model": str(response.get("model") or os.getenv("AGENT_MODEL", "openai/gpt-oss-20b")),
    }


def _fallback_response(message: str, citations: list[dict[str, Any]], understanding: dict[str, Any]) -> dict[str, Any]:
    if not citations:
        return {
            "answer": "Ainda não encontrei contexto suficiente para responder com segurança. Sincronize as integrações relevantes e tente de novo.",
            "citations": [],
            "suggestedActions": [{"label": "Sincronizar integrações", "kind": "sync"}],
            "confidence": "low",
            "model": "deterministic-fallback",
        }

    service_mode = str(understanding.get("serviceMode", "none"))
    qualifier = "nessa fonte" if service_mode == "source" else "sobre esse assunto"
    topic = _question_topic(message)
    return {
        "answer": f"Não consegui fechar uma resposta direta sobre {topic}. Encontrei {len(citations[:3])} fontes {qualifier} que parecem relacionadas.",
        "citations": citations[:3],
        "suggestedActions": [],
        "confidence": "medium",
        "model": "deterministic-fallback",
    }


def _rank_citations(message: str, events: list[dict[str, Any]], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    terms = _terms(message)
    service_intents = _service_intents(message)
    service_mode = _service_mode(message, service_intents)
    scored = []
    for event in events:
        text = " ".join(str(event.get(key, "")) for key in ("title", "summary", "type", "source"))
        scored.append((_score(terms, text) + _service_score(service_intents, service_mode, event.get("service")), event.get("occurredAt", ""), _event_citation(event)))
    for chunk in chunks:
        text = " ".join(str(chunk.get(key, "")) for key in ("title", "content", "source"))
        scored.append((_score(terms, text) + _service_score(service_intents, service_mode, chunk.get("service")), chunk.get("updatedAt", ""), _chunk_citation(chunk)))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    citations = [item[2] for item in scored if item[2]["id"]]
    return citations[:5]


def _event_citation(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "work_event",
        "id": str(event.get("id", "")),
        "service": str(event.get("service", "")),
        "title": str(event.get("title", "Work event")),
        "url": _raw_url(event.get("raw")),
    }


def _chunk_citation(chunk: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "document_chunk",
        "id": str(chunk.get("id", "")),
        "service": str(chunk.get("service", "")),
        "title": str(chunk.get("title", "Document")),
        "url": str(chunk.get("url", "")),
    }


def _raw_url(raw: Any) -> str:
    if not isinstance(raw, dict):
        return ""
    for key in ("url", "html_url", "externalUrl", "external_url"):
        value = raw.get(key)
        if isinstance(value, str):
            return value
    return ""


def _suggested_actions(value: Any) -> list[dict[str, str]]:
    actions = []
    for item in _list(value):
        label = str(item.get("label", "")).strip()
        kind = str(item.get("kind", "")).strip() or "inspect"
        if label:
            actions.append({"label": label, "kind": kind})
    return actions[:3]


def _action_label(message: str, citation: dict[str, Any]) -> str:
    lowered = message.lower()
    if "block" in lowered or "bloque" in lowered:
        return "Abrir evidências do bloqueio"
    if "decision" in lowered or "decis" in lowered:
        return "Revisar decisão"
    if "check" in lowered or "ci" in lowered or "falh" in lowered:
        return "Ver checks falhando"
    return f"Abrir contexto em {citation['service']}"


def _question_topic(message: str) -> str:
    lowered = message.lower().strip(" ?!.")
    replacements = [
        ("quantas ", ""),
        ("quantos ", ""),
        ("quanto ", ""),
        ("o que ", ""),
        ("quais ", ""),
        ("qual ", ""),
        ("me diga ", ""),
    ]
    topic = lowered
    for source, target in replacements:
        if topic.startswith(source):
            topic = target + topic[len(source):]
    return topic or "isso"


def _terms(message: str) -> list[str]:
    return [part for part in re.findall(r"[a-zA-Z0-9_#-]{3,}", message.lower())]


def _score(terms: list[str], text: str) -> int:
    lowered = text.lower()
    return sum(1 for term in terms if term in lowered)


def _service_intents(message: str) -> set[str]:
    words = set(re.findall(r"[a-zA-Z0-9_#-]{2,}", message.lower().replace("-", " ")))
    intents = {service for service in ("github", "slack", "linear", "jira", "trello", "notion", "calendar") if service in words}
    if {"git", "pr", "prs", "pull"} & words:
        intents.add("github")
    if {"meet", "meeting", "agenda", "calendario", "calendário"} & words:
        intents.add("calendar")
    return intents


def _service_mode(message: str, service_intents: set[str]) -> str:
    if not service_intents:
        return "none"
    normalized = message.lower()
    for service in service_intents:
        if f"sobre {service}" in normalized or f"about {service}" in normalized or f"relacionado a {service}" in normalized:
            return "topic"
    return "source"


def _service_score(service_intents: set[str], service_mode: str, service: Any) -> int:
    if not service_intents or service_mode == "topic":
        return 0
    return 100 if str(service).lower() in service_intents else -25


def _clean_answer(answer: str) -> str:
    answer = re.sub(r"\s+", " ", answer).strip()
    for prefix in ("Com base no contexto fornecido, ", "Based on the provided context, "):
        if answer.startswith(prefix):
            answer = answer[len(prefix):].strip()
    if len(answer) <= 450:
        return answer
    clipped = answer[:447].rstrip()
    if "." in clipped:
        clipped = clipped[: clipped.rfind(".") + 1]
    return clipped or answer[:447].rstrip() + "..."


def _asks_count(lowered: str) -> bool:
    return any(term in lowered for term in ("quantas", "quantos", "quanto", "how many", "count", "total"))


def _mentions_merged(lowered: str) -> bool:
    return any(term in lowered for term in ("mergeamos", "mergeadas", "mergeados", "merged", "integradas", "integrados"))


def _is_pull_request_event(event: dict[str, Any]) -> bool:
    text = " ".join(str(event.get(key, "")) for key in ("type", "title", "summary")).lower()
    return "pull_request" in text or re.search(r"\bpr[s]?\b", text) is not None


def _is_merged_pull_request(event: dict[str, Any]) -> bool:
    text = " ".join(str(event.get(key, "")) for key in ("type", "title", "summary")).lower()
    return "pull_request.merged" in text or "merged" in text or "mergeada" in text or "integrada" in text


def _message_time_window(lowered: str) -> str:
    if "hoje" in lowered or "today" in lowered:
        return "today"
    if "ontem" in lowered or "yesterday" in lowered:
        return "yesterday"
    if "semana" in lowered or "week" in lowered:
        return "week"
    if "mês" in lowered or "mes" in lowered or "month" in lowered:
        return "month"
    return "recent"


def _matches_time_window(value: Any, time_window: str) -> bool:
    occurred_at = _parse_datetime(value)
    if not occurred_at:
        return False
    now = datetime.now(timezone.utc)
    delta = now - occurred_at
    if delta < timedelta(0):
        return False
    if time_window == "today":
        return occurred_at.date() == now.date()
    if time_window == "yesterday":
        return occurred_at.date() == (now - timedelta(days=1)).date()
    if time_window == "week":
        return delta <= timedelta(days=7)
    if time_window == "month":
        return delta <= timedelta(days=31)
    return True


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _count_answer(count: int, lowered: str, time_window: str) -> str:
    period = {
        "today": "hoje",
        "yesterday": "ontem",
        "week": "esta semana",
        "month": "este mês",
    }.get(time_window, "no período sincronizado")
    if "pr" in lowered or "pull request" in lowered:
        unit = "PR" if count == 1 else "PRs"
        verb = "foi mergeada" if count == 1 else "foram mergeadas"
        if count == 0:
            return f"{period.capitalize()}, não encontrei PRs mergeadas no contexto sincronizado."
        return f"{period.capitalize()}, {count} {unit} {verb}."
    return f"{period.capitalize()}, encontrei {count} itens no contexto sincronizado."


def _list_of_strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _strip_json_fence(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?", "", content).strip()
        content = re.sub(r"```$", "", content).strip()
    return content


def _chat_completions_url(base_url: str) -> str:
    base_url = base_url.rstrip("/")
    if base_url.endswith("/chat/completions"):
        return base_url
    if base_url.endswith("/v1/chat"):
        return base_url + "/completions"
    if base_url.endswith("/v1"):
        return base_url + "/chat/completions"
    return base_url + "/v1/chat/completions"
