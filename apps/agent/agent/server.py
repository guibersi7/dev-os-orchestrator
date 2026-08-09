import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .service import create_response


class AgentHandler(BaseHTTPRequestHandler):
    server_version = "DeveloperOSAgent/0.1"

    def do_GET(self) -> None:
        if self.path == "/health":
            self._write(200, {"service": "developer-os-agent", "status": "ok"})
            return
        self._write(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/v1/chat":
            self._write(404, {"error": "not found"})
            return

        if not self._authorized():
            self._write(401, {"error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("payload must be an object")
            message = str(payload.get("message", "")).strip()
            if not message:
                self._write(400, {"error": "message is required"})
                return
            self._write(200, create_response(payload))
        except json.JSONDecodeError:
            self._write(400, {"error": "invalid json"})
        except Exception as exc:
            self._write(500, {"error": str(exc)})

    def log_message(self, format: str, *args: object) -> None:
        return

    def _write(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        secret = os.getenv("AGENT_SERVICE_SECRET", "").strip()
        if not secret:
            return True
        return self.headers.get("authorization") == f"Bearer {secret}"


def main() -> None:
    host, port = _addr()
    server = ThreadingHTTPServer((host, port), AgentHandler)
    print(f"Developer OS Agent listening on http://{host}:{port}", flush=True)
    server.serve_forever()


def _addr() -> tuple[str, int]:
    value = os.getenv("AGENT_ADDR", "")
    if not value:
        port = os.getenv("PORT", "8090")
        host = "0.0.0.0" if os.getenv("RENDER") else "127.0.0.1"
        return host, int(port)
    if ":" not in value:
        return value, 8090
    host, port = value.rsplit(":", 1)
    return host or "127.0.0.1", int(port)
