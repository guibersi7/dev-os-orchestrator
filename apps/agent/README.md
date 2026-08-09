# Developer OS Agent

Local consultative AI service for workspace chat.

## Run locally

```bash
python3 -m agent
```

The service listens on `AGENT_ADDR` or `127.0.0.1:8090` by default.

## Model configuration

When `AGENT_MODEL_BASE_URL` is set, the service calls an OpenAI-compatible
chat completions endpoint. Without it, the service uses a deterministic
extractive fallback so the product can run in local development and tests.

Required by the Go API:

```bash
AGENT_BASE_URL=http://127.0.0.1:8090
```

Optional for the Python service:

```bash
AGENT_MODEL_BASE_URL=https://api.groq.com/openai/v1
AGENT_MODEL=openai/gpt-oss-20b
AGENT_MODEL_API_KEY=your_groq_api_key
AGENT_TIMEOUT_SECONDS=30
```

For local Ollama-style servers, use the server root URL:

```bash
AGENT_MODEL_BASE_URL=http://127.0.0.1:11434
AGENT_MODEL=gpt-oss:20b
```
