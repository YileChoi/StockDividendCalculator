#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required but not found."
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "Creating local virtual environment..."
  python3 -m venv .venv
fi

VENV_PY=".venv/bin/python"
VENV_PIP=".venv/bin/pip"

if ! "$VENV_PY" -c "import flask" >/dev/null 2>&1; then
  echo "Installing Python dependencies..."
  "$VENV_PIP" install -r requirements.txt
fi

echo "Starting local server (auto-opens browser; uses next available port from 5000)..."
exec "$VENV_PY" run_server.py
