"""Fixtures pytest do TechFix OS.

Cada teste roda contra um banco isolado:

* SQLite (padrão local): banco temporário em `tmp_path` — nada toca o banco
  de desenvolvimento `data/techfix.db`.

* PostgreSQL (CI): quando `DATABASE_URL` aponta para um Postgres **e**
  `TECHFIX_TEST_PG=1` está definido (ambos setados no GitHub Actions), a
  suíte roda contra o Postgres real. O schema é recriado do zero a cada
  teste (DROP + init_db), então o estado nunca vaza entre testes. A flag
  evita que um `DATABASE_URL` local acidentalmente apague um banco real.

O custo do bcrypt é reduzido nos testes via BCRYPT_ROUNDS (monkeypatch
restaura o ambiente automaticamente ao fim de cada teste).
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Ordem de DROP respeita as FKs (tabelas filhas primeiro) — sintaxe válida
# tanto em SQLite quanto em PostgreSQL (sem CASCADE, que o SQLite não aceita).
_DROP_TABLES = (
    "DROP TABLE IF EXISTS historico;"
    "DROP TABLE IF EXISTS sessions;"
    "DROP TABLE IF EXISTS documentos;"
    "DROP TABLE IF EXISTS orcamentos;"
    "DROP TABLE IF EXISTS produtos;"
    "DROP TABLE IF EXISTS ordens;"
    "DROP TABLE IF EXISTS clientes;"
    "DROP TABLE IF EXISTS usuarios;"
    "DROP TABLE IF EXISTS config;"
    "DROP TABLE IF EXISTS empresa;"
)


@pytest.fixture()
def app(tmp_path, monkeypatch):
    from server.app import app as flask_app

    env_url = os.environ.get("DATABASE_URL", "")
    use_postgres = (
        env_url.startswith("postgres")
        and os.environ.get("TECHFIX_TEST_PG") == "1"
    )

    monkeypatch.setenv("BCRYPT_ROUNDS", "4")
    flask_app.config.update(TESTING=True)
    # limita o rate limiter de login ao escopo de cada teste
    from server.auth import login_limiter
    login_limiter.reset_all()

    from server.db import get_db, init_db

    with flask_app.app_context():
        if use_postgres:
            # CI: Postgres real — isola o teste recriando schema + seed do zero
            db = get_db()
            db.executescript(_DROP_TABLES)
            db.commit()
            init_db()
        else:
            monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(tmp_path / "test.db"))
            init_db()
        yield flask_app

    # teardown: o app context fecha a conexão; remove o banco temporário (SQLite)
    if not use_postgres:
        try:
            os.remove(tmp_path / "test.db")
        except OSError:
            pass


@pytest.fixture()
def client(app):
    return app.test_client()
