"""TechFix OS — Autenticação, autorização, CSRF e rate limiting.

- Senhas: bcrypt (work factor padrão).
- Sessões: token aleatório em cookie HttpOnly/SameSite; no banco
  guardamos apenas o SHA-256 do token (vazamento do DB não expõe tokens).
- Perfis: admin ('*') e tecnico (permissões operacionais).
- CSRF: padrão double-submit (cookie + header X-CSRF-Token), isento em
  modo TESTING e nas rotas de login/logout.
- Rate limiting do login: contador em memória por IP e por IP+usuário.
"""
import hashlib
import hmac
import os
import secrets
import threading
import time
from collections import deque
from functools import wraps

import bcrypt
from flask import current_app, g, jsonify, request

from .db import DAY_MS, get_db, now_ms, row_user

SESSION_COOKIE = "techfix_sid"
SESSION_DAYS = 7
CSRF_COOKIE = "techfix_csrf"


def csrf_token():
    """Token CSRF atual (vindo do cookie) ou um novo aleatório."""
    t = request.cookies.get(CSRF_COOKIE)
    return t or secrets.token_urlsafe(32)


def csrf_ok():
    """Valida o padrão double-submit: o header X-CSRF-Token deve bater com o
    cookie `techfix_csrf`. Apenas métodos mutáveis são verificados:

    - login/logout são isentos (login não tem sessão; logout não é risco e
      não pode prender o usuário fora do sistema);
    - sem cookie de sessão, deixa o `require_auth` responder 401 (sessão
      expirada) em vez de um 403 de CSRF;
    - em modo TESTING (suíte legada) o token não é exigido.
    """
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return True
    if current_app.config.get("TESTING"):
        return True
    if request.path in ("/api/auth/login", "/api/auth/logout"):
        return True
    if not request.cookies.get(SESSION_COOKIE):
        return True
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get("X-CSRF-Token", "")
    return bool(cookie) and hmac.compare_digest(cookie, header)


class LoginLimiter:
    """Rate limiter em memória para o login (por IP+usuário e por IP).

    Janela deslizante de `window_s` segundos: `max_failures` falhas por
    IP+usuário (protege contra força bruta de uma conta) e `max_per_ip`
    falhas por IP (protege contra ataques distribuídos por usuários). O
    estado é volátil (reinicia junto com o processo) — suficiente para o
    porte local/pequeno deste sistema, sem dependências externas.
    """

    def __init__(self, max_failures=5, max_per_ip=30, window_s=15 * 60):
        self.max_failures = max_failures
        self.max_per_ip = max_per_ip
        self.window_s = window_s
        self._lock = threading.Lock()
        self._fails = {}

    def _purge(self, key, now):
        dq = self._fails.get(key)
        if not dq:
            return
        while dq and now - dq[0] > self.window_s:
            dq.popleft()
        if not dq:
            self._fails.pop(key, None)

    def blocked(self, ip, usuario):
        now = time.time()
        with self._lock:
            self._purge((ip, usuario), now)
            self._purge(ip, now)
            if len(self._fails.get((ip, usuario), ())) >= self.max_failures:
                return True
            if len(self._fails.get(ip, ())) >= self.max_per_ip:
                return True
        return False

    def record_failure(self, ip, usuario):
        now = time.time()
        with self._lock:
            self._purge((ip, usuario), now)
            self._purge(ip, now)
            self._fails.setdefault((ip, usuario), deque()).append(now)
            self._fails.setdefault(ip, deque()).append(now)

    def reset(self, ip, usuario):
        """Zera as falhas do par após um login bem-sucedido."""
        with self._lock:
            self._fails.pop((ip, usuario), None)

    def reset_all(self):
        with self._lock:
            self._fails.clear()


login_limiter = LoginLimiter()

# Espelho das permissões do frontend — o servidor é a autoridade real.
PERMS = {
    "admin": ["*"],
    "tecnico": [
        "os:ver", "os:criar", "os:avancar", "os:finalizar", "os:imprimir",
        "cli:ver", "cli:criar", "cli:editar",
        "rep:ver", "rep:imprimir",
        "orc:ver", "orc:criar", "orc:editar", "orc:avancar", "orc:imprimir",
        "prod:ver", "prod:criar", "prod:editar",
        # editar/excluir produto, excluir orçamento e modelo de impressão: admin
    ],
}


def hash_password(pw):
    rounds = int(os.environ.get("BCRYPT_ROUNDS", "12"))
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=rounds)).decode("utf-8")


def verify_password(pw, hashed):
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def can(role, perm):
    perms = PERMS.get(role, [])
    return "*" in perms or perm in perms


# ---------------------------------------------------------------------------
# Sessões
# ---------------------------------------------------------------------------

def create_session(user_id):
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = now_ms()
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token_hash, usuario_id, criada_em, expira_em) VALUES (?,?,?,?)",
        (digest, user_id, now, now + SESSION_DAYS * DAY_MS),
    )
    db.commit()
    return token


def destroy_session(token):
    if not token:
        return
    digest = hashlib.sha256(token.encode()).hexdigest()
    db = get_db()
    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
    db.commit()


def destroy_user_sessions(user_id):
    db = get_db()
    db.execute("DELETE FROM sessions WHERE usuario_id=?", (user_id,))
    db.commit()


def get_session_user():
    """Devolve o usuário logado (dict público) ou None."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    db = get_db()
    row = db.execute(
        "SELECT s.expira_em, u.* FROM sessions s JOIN usuarios u ON u.id = s.usuario_id "
        "WHERE s.token_hash=?",
        (digest,),
    ).fetchone()
    if not row:
        return None
    if row["expira_em"] < now_ms():
        destroy_session(token)
        return None
    if not row["ativo"]:
        return None
    return row_user(row)


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------

def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_session_user()
        if not user:
            return jsonify({"erro": "Sessão inválida ou expirada."}), 401
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def require_perm(perm):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_session_user()
            if not user:
                return jsonify({"erro": "Sessão inválida ou expirada."}), 401
            if not can(user["role"], perm):
                return jsonify({"erro": "Acesso restrito."}), 403
            g.user = user
            return fn(*args, **kwargs)
        return wrapper
    return deco
