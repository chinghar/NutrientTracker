"""A minimal authenticating reverse proxy to put in front of a self-hosted
Ollama instance before exposing it to the internet via a tunnel.

Ollama itself has no authentication -- anyone who finds the tunnel's public
URL could otherwise use your machine's compute for free. This proxy sits
between the tunnel and Ollama, rejecting any request that doesn't present
the shared secret as a Bearer token, and only forwarding authorized ones.

Usage:
    export OLLAMA_AUTH_PROXY_SECRET=some-long-random-string
    python scripts/ollama_auth_proxy.py [--port 11435] [--upstream http://localhost:11434]

Then tunnel *this* proxy's port (not Ollama's port directly), and set on
your Vercel backend:
    VISION_PROVIDER=ollama
    OLLAMA_HOST=<the tunnel's public URL>
    OLLAMA_API_KEY=<the same OLLAMA_AUTH_PROXY_SECRET value>
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 11435
DEFAULT_UPSTREAM = "http://localhost:11434"


def make_handler(secret: str, upstream: str) -> type[BaseHTTPRequestHandler]:
    class AuthProxyHandler(BaseHTTPRequestHandler):
        def _authorized(self) -> bool:
            expected = f"Bearer {secret}"
            return self.headers.get("Authorization") == expected

        def _forward(self) -> None:
            if not self._authorized():
                body = b"Unauthorized"
                self.send_response(401)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            content_length = int(self.headers.get("Content-Length", 0))
            request_body = self.rfile.read(content_length) if content_length else None

            upstream_req = urllib.request.Request(
                f"{upstream.rstrip('/')}{self.path}",
                data=request_body,
                method=self.command,
                headers={"Content-Type": self.headers.get("Content-Type", "application/json")},
            )
            try:
                with urllib.request.urlopen(upstream_req, timeout=120) as resp:
                    response_body = resp.read()
                    self.send_response(resp.status)
                    self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                    self.send_header("Content-Length", str(len(response_body)))
                    self.end_headers()
                    self.wfile.write(response_body)
            except urllib.error.URLError as e:
                body = f"Could not reach Ollama upstream at {upstream}: {e}".encode()
                self.send_response(502)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        def do_POST(self) -> None:
            self._forward()

        def do_GET(self) -> None:
            self._forward()

        def log_message(self, format: str, *args) -> None:  # noqa: A002
            authorized = "authorized" if self._authorized() else "REJECTED"
            print(f"[ollama-auth-proxy] {self.command} {self.path} -- {authorized}")

    return AuthProxyHandler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--upstream", default=DEFAULT_UPSTREAM, help="The real Ollama server to forward to")
    args = parser.parse_args(argv)

    secret = os.environ.get("OLLAMA_AUTH_PROXY_SECRET")
    if not secret:
        print("ERROR: set OLLAMA_AUTH_PROXY_SECRET to a long random string before running this.", file=sys.stderr)
        return 1

    server = ThreadingHTTPServer(("0.0.0.0", args.port), make_handler(secret, args.upstream))
    print(f"Authenticating proxy listening on http://0.0.0.0:{args.port}, forwarding to {args.upstream}")
    print("Tunnel this port, not Ollama's port directly.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
