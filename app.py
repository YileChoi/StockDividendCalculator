from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile

from flask import Flask, jsonify, request, send_file, send_from_directory

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # 2 MB

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
LEDGER_FILE = DATA_DIR / "ledger.json"
FAMILY_DB_FILE = DATA_DIR / "family_dashboard.json"
DEFAULT_LEDGER = {
    "schemaVersion": 1,
    "state": {
        "version": 1,
        "members": [],
        "totalUnitsMicro": {"__bigint": "0"},
        "portfolioCents": {"__bigint": "0"},
        "transactions": [],
        "nextMemberId": 1,
        "nextTransactionId": 1,
    },
    "changeHistory": [],
    "nextChangeId": 1,
}
DEFAULT_FAMILY_DB = {
    "schemaVersion": 1,
    "state": {
        "families": [],
        "nextFamilyId": 1,
    },
}


def ensure_ledger_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if LEDGER_FILE.exists():
        return
    _write_ledger(DEFAULT_LEDGER)


def ensure_family_db_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if FAMILY_DB_FILE.exists():
        return
    _write_family_db(DEFAULT_FAMILY_DB)


def _read_ledger() -> dict:
    ensure_ledger_file()
    try:
        with LEDGER_FILE.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        payload = DEFAULT_LEDGER
        _write_ledger(payload)
    if not isinstance(payload, dict):
        payload = DEFAULT_LEDGER
    return payload


def _write_ledger(payload: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        "w",
        encoding="utf-8",
        delete=False,
        dir=str(DATA_DIR),
        prefix="ledger-",
        suffix=".tmp",
    ) as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2)
        tmp.flush()
        temp_path = Path(tmp.name)
    temp_path.replace(LEDGER_FILE)


def _read_family_db() -> dict:
    ensure_family_db_file()
    try:
        with FAMILY_DB_FILE.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        payload = DEFAULT_FAMILY_DB
        _write_family_db(payload)
    if not isinstance(payload, dict):
        payload = DEFAULT_FAMILY_DB
    return payload


def _write_family_db(payload: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        "w",
        encoding="utf-8",
        delete=False,
        dir=str(DATA_DIR),
        prefix="family-db-",
        suffix=".tmp",
    ) as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2)
        tmp.flush()
        temp_path = Path(tmp.name)
    temp_path.replace(FAMILY_DB_FILE)


def _updated_at_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@app.get("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/logic")
def logic():
    return send_from_directory(BASE_DIR, "logic.html")


@app.get("/styles.css")
def styles():
    return send_from_directory(BASE_DIR, "styles.css")


@app.get("/js/<path:filename>")
def js_files(filename):
    return send_from_directory(BASE_DIR / "js", filename)


@app.get("/api/ledger")
def get_ledger():
    payload = _read_ledger()
    return jsonify(payload)


@app.put("/api/ledger")
def put_ledger():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Body must be a JSON object."}), 400

    _write_ledger(payload)
    return jsonify(
        {
            "ok": True,
            "path": "data/ledger.json",
            "updatedAt": _updated_at_iso(),
        }
    )


@app.post("/api/ledger/import")
def import_ledger():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Imported file must be JSON object."}), 400

    _write_ledger(payload)
    return jsonify(
        {
            "ok": True,
            "path": "data/ledger.json",
            "updatedAt": _updated_at_iso(),
        }
    )


@app.get("/api/ledger/export")
def export_ledger():
    ensure_ledger_file()
    return send_file(
        LEDGER_FILE,
        mimetype="application/json",
        as_attachment=True,
        download_name="ledger.json",
    )


@app.get("/api/family-db")
def get_family_db():
    payload = _read_family_db()
    return jsonify(payload)


@app.put("/api/family-db")
def put_family_db():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Body must be a JSON object."}), 400

    _write_family_db(payload)
    return jsonify(
        {
            "ok": True,
            "path": "data/family_dashboard.json",
            "updatedAt": _updated_at_iso(),
        }
    )


@app.post("/api/family-db/import")
def import_family_db():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Imported file must be JSON object."}), 400

    _write_family_db(payload)
    return jsonify(
        {
            "ok": True,
            "path": "data/family_dashboard.json",
            "updatedAt": _updated_at_iso(),
        }
    )


@app.get("/api/family-db/export")
def export_family_db():
    ensure_family_db_file()
    return send_file(
        FAMILY_DB_FILE,
        mimetype="application/json",
        as_attachment=True,
        download_name="family_dashboard.json",
    )


@app.get("/api/server/status")
def server_status():
    return jsonify(
        {
            "ok": True,
            "host": app.config.get("APP_HOST", "127.0.0.1"),
            "port": app.config.get("APP_PORT"),
        }
    )


@app.post("/api/server/stop")
def stop_server():
    def stop_later(fn) -> None:
        # Small delay allows HTTP response to flush before shutdown.
        time.sleep(0.2)
        fn()

    callback = app.config.get("STOP_SERVER_CALLBACK")
    if callable(callback):
        threading.Thread(target=stop_later, args=(callback,), daemon=True).start()
        return jsonify({"ok": True, "stopping": True})

    shutdown_func = request.environ.get("werkzeug.server.shutdown")
    if shutdown_func is not None:
        threading.Thread(target=stop_later, args=(shutdown_func,), daemon=True).start()
        return jsonify({"ok": True, "stopping": True})

    return jsonify({"ok": False, "error": "Server stop is not available."}), 500


if __name__ == "__main__":
    ensure_ledger_file()
    ensure_family_db_file()
    app.run(debug=True)
