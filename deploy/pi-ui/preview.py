"""Read-only UI preview: proxy status/camera, never forward hardware commands."""
import argparse
import functools
import json
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


class Preview(SimpleHTTPRequestHandler):
    upstream = "http://192.168.1.219:8090"

    def do_GET(self):
        if urlparse(self.path).path in ("/status", "/health", "/snapshot"):
            try:
                with urllib.request.urlopen(self.upstream + self.path, timeout=15) as response:
                    content = response.read()
                    self.send_response(response.status)
                    self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(content)
            except (urllib.error.URLError, TimeoutError):
                self.send_error(503, "Pi temporarily unavailable")
        else:
            super().do_GET()

    def do_POST(self):
        body = json.dumps({"ok": False, "error": "Read-only UI preview: hardware controls disabled"}).encode()
        self.send_response(403)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--port", default=4178, type=int)
    args = parser.parse_args()
    handler = functools.partial(Preview, directory=args.root)
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()
