from __future__ import annotations

import os
import socket
import threading
import webbrowser

from werkzeug.serving import make_server

from app import app, ensure_ledger_file


def find_available_port(host: str, preferred_port: int, max_checks: int = 200) -> int:
    for offset in range(max_checks):
        port = preferred_port + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, port))
            except OSError:
                continue
            return port
    raise RuntimeError(
        f"Could not find an available port in range {preferred_port}-{preferred_port + max_checks - 1}."
    )


def main() -> None:
    host = "127.0.0.1"
    preferred_port = 5000

    ensure_ledger_file()
    port = find_available_port(host, preferred_port)

    server = make_server(host, port, app, threaded=True)
    app.config["APP_HOST"] = host
    app.config["APP_PORT"] = port
    app.config["STOP_SERVER_CALLBACK"] = server.shutdown

    url = f"http://{host}:{port}/"
    print(f"Starting server at {url}")

    if os.environ.get("NO_BROWSER", "").strip() != "1":
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
