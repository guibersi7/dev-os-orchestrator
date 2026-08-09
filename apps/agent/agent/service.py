import json
import os
import re
import urllib.request
from typing import Any


def create_response(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message", "")).strip()
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    events = _list(context.get("events"))
    chunks = _list(context.get("documentChunks"))
    citations = _rank_citations(message, events, chunks)

    model_response = _call_model(message, events, chunks, citations)
    if model_response:
        return _normalize_model_response(model_response, citations)

    return _fallback_response(message, citations)


def _call_model(
    message: str,
    events: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
    citations: list[dict[str, Any]],
) -> dict[str, Any] | None:
    base_url = os.getenv("AGENT_MODEL_BASE_URL", "").rstrip("/")
    if not base_url:
        return None

    model = os.getenv("AGENT_MODEL", "local-agent")
    timeout = float(os.getenv("AGENT_TIMEOUT_SECONDS", "20"))
    prompt = {
        "role": "user",
        "content": (
            "Answer the user's workspace question using only the supplied context. "
            "If evidence is insufficient, say that clearly. Return compact JSON with "
            "answer, citations, suggestedActions, confidence, and model.\n\n"
            f"Question: {message}\n\n"
            f"Context: {json.dumps({'events': events, 'documentChunks': chunks}, default=str)}\n\n"
            f"Allowed citations: {json.dumps(citations, default=str)}"
        ),
    }
    request_payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are the Developer OS workspace agent. Never invent facts or citations.",
            },
            prompt,
        ],
        "temperature": 0.2,
    }

    body = json.dumps(request_payload).encode("utf-8")
    request = urllib.request.Request(
        base_url + "/v1/chat/completions",
        data=body,
        headers={"content-type": "application/json"},
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
        "answer": str(response.get("answer") or "I did not find enough workspace context to answer that.").strip(),
        "citations": citations,
        "suggestedActions": _suggested_actions(response.get("suggestedActions")),
        "confidence": str(response.get("confidence") or ("medium" if citations else "low")),
        "model": str(response.get("model") or os.getenv("AGENT_MODEL", "local-agent")),
    }


def _fallback_response(message: str, citations: list[dict[str, Any]]) -> dict[str, Any]:
    if not citations:
        return {
            "answer": "I did not find enough workspace context to answer that yet. Sync connected tools and try again.",
            "citations": [],
            "suggestedActions": [{"label": "Sync connected integrations", "kind": "sync"}],
            "confidence": "low",
            "model": "deterministic-fallback",
        }

    top_titles = ", ".join(item["title"] for item in citations[:3])
    return {
        "answer": f"Based on the available workspace context, the strongest related signals are: {top_titles}.",
        "citations": citations[:3],
        "suggestedActions": [{"label": _action_label(message, citations[0]), "kind": "inspect"}],
        "confidence": "medium",
        "model": "deterministic-fallback",
    }


def _rank_citations(message: str, events: list[dict[str, Any]], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    terms = _terms(message)
    scored = []
    for event in events:
        text = " ".join(str(event.get(key, "")) for key in ("title", "summary", "type", "source"))
        scored.append((_score(terms, text), event.get("occurredAt", ""), _event_citation(event)))
    for chunk in chunks:
        text = " ".join(str(chunk.get(key, "")) for key in ("title", "content", "source"))
        scored.append((_score(terms, text), chunk.get("updatedAt", ""), _chunk_citation(chunk)))

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
        return "Inspect blocker evidence"
    if "decision" in lowered or "decis" in lowered:
        return "Review decision context"
    return f"Open {citation['service']} context"


def _terms(message: str) -> list[str]:
    return [part for part in re.findall(r"[a-zA-Z0-9_#-]{3,}", message.lower())]


def _score(terms: list[str], text: str) -> int:
    lowered = text.lower()
    return sum(1 for term in terms if term in lowered)


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
