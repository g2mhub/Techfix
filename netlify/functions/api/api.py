"""TechFix OS — Netlify Function (Python) que embrulha o Flask.

Todo o trafego `/api/*` chega aqui via redirect no netlify.toml e é
delegado a aplicacao WSGI com a biblioteca `serverless-wsgi`.

Arquitetura:
  Netlify (frontend estatico) -> Netlify Function (Flask) -> Supabase (banco)
"""
import os
import sys

# ---------------------------------------------------------------------------
# sys.path: garante que o pacote `server/` (raiz do repositorio) seja
# importavel independentemente do layout de empacotamento da Function.
# ---------------------------------------------------------------------------
_FN_DIR = os.path.dirname(os.path.abspath(__file__))

def _add_project_root():
    d = os.path.dirname(_FN_DIR)  # netlify/functions
    for _ in range(8):
        if os.path.exists(os.path.join(d, "server", "app.py")):
            if d not in sys.path:
                sys.path.insert(0, d)
            return d
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return None

_add_project_root()

from server.app import app
from server.db import init_db
from serverless_wsgi import handle_request

# Boot do banco apenas no cold start (idempotente)
_BOOTED = False

def _ensure_ready():
    global _BOOTED
    if _BOOTED:
        return
    with app.app_context():
        init_db()
    _BOOTED = True

def _normalize_path(path):
    """Reconstitui o PATH_INFO que o Flask espera (sempre `/api/...`)."""
    path = path or "/"
    if path.startswith("/.netlify/functions/api"):
        path = "/api" + path[len("/.netlify/functions/api"):]
    return path or "/"

def handler(event, context):
    _ensure_ready()
    event = dict(event or {})
    event["path"] = _normalize_path(event.get("path", "/"))
    return handle_request(app, event, context)
