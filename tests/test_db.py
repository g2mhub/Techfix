"""Testes unitários do adapter de banco (server/db.py).

Cobrem a parte que não depende de um servidor real: resolução de
DATABASE_URL (Postgres/SQLite/legado) e a tradução de placeholders
`?` -> `%s` usada no driver Postgres.
"""


def test_resolve_db_url_postgres(monkeypatch):
    from server.db import _resolve_db_url
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host:5432/db")
    assert _resolve_db_url() == "postgresql://u:p@host:5432/db"


def test_resolve_db_url_sqlite_relativo_ancora_no_projeto(monkeypatch):
    from server.db import PROJECT_ROOT, _resolve_db_url
    monkeypatch.setenv("DATABASE_URL", "sqlite:///data/techfix.db")
    resolved = _resolve_db_url()
    assert resolved == os_join(PROJECT_ROOT, "data", "techfix.db")


def test_resolve_db_url_sqlite_absoluto(monkeypatch, tmp_path):
    from server.db import _resolve_db_url
    absolute = str(tmp_path / "x.db")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + absolute)
    assert _resolve_db_url() == absolute


def test_resolve_db_url_legado(monkeypatch):
    from server.db import _resolve_db_url
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("TECHFIX_DB", "C:/tmp/legacy.db")
    assert _resolve_db_url() == "C:/tmp/legacy.db"


def test_resolve_db_url_padrao(monkeypatch):
    from server.db import DEFAULT_SQLITE, _resolve_db_url
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("TECHFIX_DB", raising=False)
    assert _resolve_db_url() == DEFAULT_SQLITE


def test_placeholder_translation():
    from server.db import _PLACEHOLDER_RE
    sql = "SELECT * FROM t WHERE a=? AND b=? OR c LIKE ?"
    assert _PLACEHOLDER_RE.sub("%s", sql) == (
        "SELECT * FROM t WHERE a=%s AND b=%s OR c LIKE %s"
    )


def test_placeholder_nao_afeta_sql_sem_params():
    from server.db import _PLACEHOLDER_RE
    sql = "SELECT 1"
    assert _PLACEHOLDER_RE.sub("%s", sql) == "SELECT 1"


def os_join(*parts):
    import os
    return os.path.join(*parts)
