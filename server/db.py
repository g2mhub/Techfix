"""TechFix OS — Camada de dados (SQLite ou PostgreSQL).

A escolha do banco é feita pela variável de ambiente DATABASE_URL:
  - postgresql://usuario:senha@host:porta/banco  -> PostgreSQL (psycopg2)
  - sqlite:///caminho/para/arquivo.db            -> SQLite (padrão do projeto)
  - (vazio) -> usa TECHFIX_DB (legado) ou data/techfix.db

O wrapper `_DB` unifica as duas APIs: placeholders `?` são traduzidos para
`%s` no Postgres e as linhas são acessíveis por nome de coluna em ambos.

Schema: usuarios, sessions, clientes, ordens, historico, empresa,
produtos (catálogo reutilizado na OS e nos orçamentos), orcamentos.
"""
import json
import os
import re
import sqlite3
import sys
import uuid
from datetime import datetime

from flask import g


def base_dir():
    r"""Diretório raiz do app.

    Quando empacotado com PyInstaller (frozen), o `__file__` aponta para o
    diretório temporário de extração — a raiz real é o diretório do exe,
    que também é o local onde o banco SQLite precisa ser gravado. Se o
    diretório do exe não for gravável (ex.: Program Files), o banco vai
    para %LOCALAPPDATA%\TechFixOS.
    """
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        probe = os.path.join(exe_dir, ".techfix_write_probe")
        try:
            with open(probe, "w"):
                pass
            os.remove(probe)
            return exe_dir
        except OSError:
            return os.path.join(
                os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "TechFixOS"
            )
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


PROJECT_ROOT = base_dir()
DEFAULT_SQLITE = os.path.join(PROJECT_ROOT, "data", "techfix.db")

DAY_MS = 86400000

_PLACEHOLDER_RE = re.compile(r"\?")


def uid():
    return uuid.uuid4().hex[:8]


def now_ms():
    return int(datetime.now().timestamp() * 1000)


def _resolve_db_url():
    """Resolve DATABASE_URL de forma lazy (lido a cada conexão, testável)."""
    url = os.environ.get("DATABASE_URL") or ""
    if url.startswith("postgres"):
        return url
    if url.startswith("sqlite:"):
        path = url.replace("sqlite:///", "", 1).replace("sqlite://", "", 1)
        if not os.path.isabs(path):
            path = os.path.join(PROJECT_ROOT, path)
        return os.path.normpath(path)
    return os.environ.get("TECHFIX_DB", DEFAULT_SQLITE)


class _DB:
    """Wrapper fino que unifica sqlite3 e psycopg2 (RealDictCursor)."""

    def __init__(self, conn, is_pg):
        self.conn = conn
        self.is_pg = is_pg

    def execute(self, sql, params=()):
        if self.is_pg:
            sql = _PLACEHOLDER_RE.sub("%s", sql)
        cur = self.conn.cursor()
        cur.execute(sql, params)
        return cur

    def executescript(self, script):
        if self.is_pg:
            # DDL simples, sem ';' dentro de literais — dividir por ';' é seguro aqui
            for stmt in script.split(";"):
                s = stmt.strip()
                if s:
                    self.execute(s)
        else:
            self.conn.executescript(script)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


def _connect():
    url = _resolve_db_url()
    if url.startswith("postgres"):
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
        return _DB(conn, is_pg=True)
    path = url
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return _DB(conn, is_pg=False)


def get_db():
    if "db" not in g:
        g.db = _connect()
    return g.db


def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------------------
# Mappers (snake_case -> camelCase usado pelo frontend)
# ---------------------------------------------------------------------------

def row_user(u):
    return {
        "id": u["id"], "nome": u["nome"], "usuario": u["usuario"],
        "role": u["role"], "ativo": bool(u["ativo"]), "criadoEm": u["criado_em"],
    }


def row_cliente(c):
    return {
        "id": c["id"], "nome": c["nome"], "telefone": c["telefone"],
        "email": c["email"], "endereco": c["endereco"], "criadoEm": c["criado_em"],
    }


def row_hist(h):
    return {
        "id": h["id"], "data": h["data"], "status": h["status"],
        "titulo": h["titulo"], "nota": h["nota"],
    }


def row_produto(p):
    return {
        "id": p["id"], "nome": p["nome"], "marca": p["marca"],
        "valor": p["valor"], "criadoPor": p["criado_por"], "criadoEm": p["criado_em"],
    }


def row_orcamento(o):
    """Converte linha do orçamento; os itens ficam como lista de dicts."""
    try:
        itens = json.loads(o["itens"]) if o["itens"] else []
    except (TypeError, ValueError):
        itens = []
    return {
        "id": o["id"], "numero": o["numero"], "clienteId": o["cliente_id"],
        "tecnico": o["tecnico"], "descricao": o["descricao"],
        "itens": itens, "valorTotal": o["valor_total"],
        "validade": o["validade"], "status": o["status"],
        "observacoes": o["observacoes"], "condicoes": o["condicoes"],
        "criadoEm": o["criado_em"],
        "documentos": docs_of("orcamento", o["id"]),
    }


def row_empresa(e):
    return {
        "nome": e["nome"], "cnpj": e["cnpj"],
        "endereco": e["endereco"], "telefone": e["telefone"],
        # logo vira um flag: o arquivo é servido por GET /api/empresa/logo
        "logo": bool(e["logo"]),
    }


def row_doc(d):
    return {
        "id": d["id"], "nome": d["nome"], "tamanho": d["tamanho"],
        "criadoPor": d["criado_por"], "criadoEm": d["criado_em"],
    }


def docs_of(entidade, entidade_id):
    """Metadados dos documentos (PDFs) anexados a uma OS ou orçamento."""
    db = get_db()
    rows = db.execute(
        "SELECT id, nome, criado_por, criado_em, LENGTH(conteudo) AS tamanho "
        "FROM documentos WHERE entidade=? AND entidade_id=? ORDER BY criado_em DESC",
        (entidade, entidade_id),
    ).fetchall()
    return [row_doc(r) for r in rows]


def row_ordem(o, hist):
    return {
        "id": o["id"], "numero": o["numero"], "clienteId": o["cliente_id"],
        "equipamento": o["equipamento"], "marca": o["marca"], "serie": o["serie"],
        "descricao": o["descricao"], "prioridade": o["prioridade"],
        "status": o["status"], "valorEstimado": o["valor_estimado"],
        "valorFinal": o["valor_final"], "dataAbertura": o["data_abertura"],
        "dataConclusao": o["data_conclusao"], "prazo": o["prazo"],
        "tecnico": o["tecnico"], "observacoes": o["observacoes"],
        "historico": hist,
        "documentos": docs_of("ordem", o["id"]),
    }


# ---------------------------------------------------------------------------
# Consultas
# ---------------------------------------------------------------------------

def get_ordem_full(ordem_id):
    db = get_db()
    o = db.execute("SELECT * FROM ordens WHERE id=?", (ordem_id,)).fetchone()
    if not o:
        return None
    hist = db.execute(
        "SELECT * FROM historico WHERE ordem_id=? ORDER BY data ASC", (ordem_id,)
    ).fetchall()
    return row_ordem(o, [row_hist(h) for h in hist])


def ordens_payload():
    db = get_db()
    rows = db.execute("SELECT * FROM ordens ORDER BY data_abertura DESC").fetchall()
    out = []
    for o in rows:
        hist = db.execute(
            "SELECT * FROM historico WHERE ordem_id=? ORDER BY data ASC", (o["id"],)
        ).fetchall()
        out.append(row_ordem(o, [row_hist(h) for h in hist]))
    return out


def orcamentos_payload():
    db = get_db()
    rows = db.execute("SELECT * FROM orcamentos ORDER BY criado_em DESC").fetchall()
    return [row_orcamento(o) for o in rows]


def get_orcamento_full(orc_id):
    db = get_db()
    o = db.execute("SELECT * FROM orcamentos WHERE id=?", (orc_id,)).fetchone()
    return row_orcamento(o) if o else None


ORC_CAMPOS_VALIDOS = {"cliente_contato", "marca", "descricao", "condicoes", "observacoes"}


def orc_modelo_payload():
    """Modelo de impressão do orçamento (observações padrão, rodapé, campos)."""
    db = get_db()
    def _get(chave, padrao):
        r = db.execute("SELECT valor FROM config WHERE chave=?", (chave,)).fetchone()
        return r["valor"] if r else padrao
    campos = _get("orc_campos", "")
    try:
        campos = json.loads(campos)
    except (TypeError, ValueError):
        campos = []
    if not isinstance(campos, list) or not campos:
        campos = sorted(ORC_CAMPOS_VALIDOS)
    return {
        "obsPadrao": _get("orc_obs_padrao", ""),
        "rodape": _get("orc_rodape", ""),
        "campos": [c for c in campos if c in ORC_CAMPOS_VALIDOS],
    }


def bootstrap_payload():
    db = get_db()
    emp = db.execute("SELECT * FROM empresa WHERE id=1").fetchone()
    clientes = db.execute("SELECT * FROM clientes ORDER BY nome").fetchall()
    # usuários ativos são as opções de "Técnico responsável" (Nova OS e orçamentos)
    tecnicos = db.execute(
        "SELECT id, nome FROM usuarios WHERE ativo=1 ORDER BY nome"
    ).fetchall()
    # catálogo de produtos (reutilizado na OS e nos itens de orçamento)
    produtos = db.execute("SELECT * FROM produtos ORDER BY nome").fetchall()
    return {
        "empresa": row_empresa(emp),
        "clientes": [row_cliente(c) for c in clientes],
        "ordens": ordens_payload(),
        "tecnicos": [{"id": t["id"], "nome": t["nome"]} for t in tecnicos],
        "produtos": [row_produto(p) for p in produtos],
        "orcamentos": orcamentos_payload(),
        "orcModelo": orc_modelo_payload(),
    }


def gerar_numero(db):
    ano = datetime.now().year
    prefix = "OS-%d-" % ano
    used = {r["numero"] for r in db.execute(
        "SELECT numero FROM ordens WHERE numero LIKE ?", (prefix + "%",)
    ).fetchall()}
    n = len(used) + 1
    while ("%s%04d" % (prefix, n)) in used:
        n += 1
    return "%s%04d" % (prefix, n)


def gerar_numero_orc(db):
    ano = datetime.now().year
    prefix = "ORC-%d-" % ano
    used = {r["numero"] for r in db.execute(
        "SELECT numero FROM orcamentos WHERE numero LIKE ?", (prefix + "%",)
    ).fetchall()}
    n = len(used) + 1
    while ("%s%04d" % (prefix, n)) in used:
        n += 1
    return "%s%04d" % (prefix, n)


# ---------------------------------------------------------------------------
# Schema + seed
# ---------------------------------------------------------------------------

def init_db():
    db = get_db()
    db.executescript(
        """
        -- NOTA: timestamps são epoch em MILISSEGUNDOS (~1.75e12) e valores são
        -- decimais — BIGINT/DOUBLE PRECISION evitam overflow/precisão no Postgres
        -- (no SQLite BIGINT tem afinidade INTEGER e DOUBLE PRECISION, REAL).
        CREATE TABLE IF NOT EXISTS usuarios (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL,
          usuario TEXT UNIQUE NOT NULL,
          senha_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'tecnico',
          ativo INTEGER NOT NULL DEFAULT 1,
          criado_em BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          usuario_id TEXT NOT NULL,
          criada_em BIGINT NOT NULL,
          expira_em BIGINT NOT NULL,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        );
        CREATE TABLE IF NOT EXISTS clientes (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL,
          telefone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          endereco TEXT NOT NULL DEFAULT '',
          criado_em BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ordens (
          id TEXT PRIMARY KEY,
          numero TEXT UNIQUE NOT NULL,
          cliente_id TEXT NOT NULL,
          equipamento TEXT NOT NULL,
          marca TEXT NOT NULL DEFAULT '',
          serie TEXT NOT NULL DEFAULT '',
          descricao TEXT NOT NULL DEFAULT '',
          prioridade TEXT NOT NULL DEFAULT 'media',
          status TEXT NOT NULL DEFAULT 'aberta',
          valor_estimado DOUBLE PRECISION,
          valor_final DOUBLE PRECISION,
          data_abertura BIGINT NOT NULL,
          data_conclusao BIGINT,
          prazo BIGINT,
          tecnico TEXT NOT NULL DEFAULT '',
          observacoes TEXT NOT NULL DEFAULT '',
          FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        );
        CREATE TABLE IF NOT EXISTS historico (
          id TEXT PRIMARY KEY,
          ordem_id TEXT NOT NULL,
          data BIGINT NOT NULL,
          status TEXT NOT NULL,
          titulo TEXT NOT NULL,
          nota TEXT NOT NULL DEFAULT '',
          FOREIGN KEY (ordem_id) REFERENCES ordens(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS empresa (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          nome TEXT NOT NULL DEFAULT '',
          cnpj TEXT NOT NULL DEFAULT '',
          endereco TEXT NOT NULL DEFAULT '',
          telefone TEXT NOT NULL DEFAULT '',
          logo TEXT NOT NULL DEFAULT ''
        );
        -- Catálogo de produtos: cadastrado pelos usuários e reutilizado
        -- na Nova OS (campo Produto) e nos itens de orçamento.
        CREATE TABLE IF NOT EXISTS produtos (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL,
          marca TEXT NOT NULL DEFAULT '',
          valor DOUBLE PRECISION,
          criado_por TEXT NOT NULL,
          criado_em BIGINT NOT NULL
        );
        -- Orçamentos: cliente + itens (JSON) + validade definida manualmente
        -- pelo técnico responsável.
        CREATE TABLE IF NOT EXISTS orcamentos (
          id TEXT PRIMARY KEY,
          numero TEXT UNIQUE NOT NULL,
          cliente_id TEXT NOT NULL,
          tecnico TEXT NOT NULL DEFAULT '',
          descricao TEXT NOT NULL DEFAULT '',
          itens TEXT NOT NULL DEFAULT '[]',
          valor_total DOUBLE PRECISION NOT NULL DEFAULT 0,
          validade BIGINT NOT NULL,
          status TEXT NOT NULL DEFAULT 'aberto',
          observacoes TEXT NOT NULL DEFAULT '',
          condicoes TEXT NOT NULL DEFAULT '',
          criado_em BIGINT NOT NULL,
          FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        );
        -- Configurações chave/valor (ex.: modelo de impressão do orçamento)
        CREATE TABLE IF NOT EXISTS config (
          chave TEXT PRIMARY KEY,
          valor TEXT NOT NULL DEFAULT ''
        );
        -- Documentos (PDFs) gerados e anexados a uma OS ('ordem') ou
        -- orçamento ('orcamento') para reimpressão posterior.
        -- NOTA: BYTEA funciona no SQLite (tipo dinâmico) e é o tipo nativo
        -- do PostgreSQL para binários — `BLOB` quebraria o Postgres.
        CREATE TABLE IF NOT EXISTS documentos (
          id TEXT PRIMARY KEY,
          entidade TEXT NOT NULL,
          entidade_id TEXT NOT NULL,
          nome TEXT NOT NULL,
          conteudo BYTEA NOT NULL,
          criado_por TEXT NOT NULL,
          criado_em BIGINT NOT NULL
        );
        """
    )
    db.commit()
    _migrate(db)
    seed_defaults()


# Upsert portável (SQLite >= 3.24 e PostgreSQL)
UPSERT_EMPRESA = (
    "INSERT INTO empresa (id,nome,cnpj,endereco,telefone,logo) VALUES (1,?,?,?,?,?) "
    "ON CONFLICT (id) DO UPDATE SET nome=excluded.nome, cnpj=excluded.cnpj, "
    "endereco=excluded.endereco, telefone=excluded.telefone, logo=excluded.logo"
)
# Seed só insere quando a linha não existe — nunca sobrescreve dados editados
SEED_EMPRESA = (
    "INSERT INTO empresa (id,nome,cnpj,endereco,telefone,logo) VALUES (1,?,?,?,?,?) "
    "ON CONFLICT (id) DO NOTHING"
)


def _coluna_existe(db, tabela, coluna):
    """Checa se uma coluna existe (SQLite via PRAGMA, Postgres via information_schema)."""
    if db.is_pg:
        row = db.execute(
            "SELECT 1 FROM information_schema.columns WHERE table_name=? AND column_name=?",
            (tabela, coluna),
        ).fetchone()
        return row is not None
    return any(
        r["name"] == coluna
        for r in db.execute("PRAGMA table_info(%s)" % tabela).fetchall()
    )


def _migrate(db):
    """Migrações incrementais do schema (compatíveis SQLite e PostgreSQL)."""
    if not _coluna_existe(db, "empresa", "logo"):
        db.execute("ALTER TABLE empresa ADD COLUMN logo TEXT NOT NULL DEFAULT ''")
    db.commit()


def seed_defaults():
    """Cria o usuário administrador padrão e os dados da empresa (idempotente).

    O sistema nasce limpo: sem contas demo e sem ordens/clientes de teste —
    apenas a conta `admin` (senha padrão `123456`, alterável pelo próprio
    usuário em "Alterar minha senha") e a razão social da empresa, usada nos
    relatórios/impressões. Ambas as escritas usam ON CONFLICT DO NOTHING, então
    rodar de novo é seguro: nunca duplica nem sobrescreve senhas já trocadas ou
    dados da empresa já editados.
    """
    from .auth import hash_password  # import tardio evita ciclo

    db = get_db()
    db.execute(
        "INSERT INTO usuarios (id,nome,usuario,senha_hash,role,ativo,criado_em) VALUES (?,?,?,?,?,?,?) ON CONFLICT (usuario) DO NOTHING",
        (uid(), "Administrador", "admin", hash_password("123456"), "admin", 1, now_ms()),
    )
    db.execute(
        SEED_EMPRESA,
        (
            "TechFix Assistência Técnica",
            "12.345.678/0001-90",
            "Rua das Flores, 123 · Centro · São Paulo/SP",
            "(11) 4002-8922",
            "",
        ),
    )
    db.commit()
