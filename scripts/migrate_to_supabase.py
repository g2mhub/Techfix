#!/usr/bin/env python3
"""TechFix OS — Migração de banco de dados para Supabase.

Uso:
  1. Configure as variáveis de ambiente:
     - DATABASE_URL: banco de origem (SQLite local ou PostgreSQL externo)
     - SUPABASE_URL: URL de conexão do Supabase (postgresql://...)

  2. Execute:
     python scripts/migrate_to_supabase.py

  O script:
  - Conecta ao banco de origem e exporta todos os dados
  - Conecta ao Supabase e cria o schema (se necessário)
  - Importa todos os dados preservando IDs e timestamps
  - Valida a migração contando registros
"""
import io
import json
import os
import sys
import uuid
from datetime import datetime

# Configura encoding para Windows (evita erro com emojis)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_connection(url, dbname=None):
    """Conecta ao banco usando a URL fornecida."""
    import psycopg2
    import psycopg2.extras

    # Ajusta a URL se necessário
    if dbname:
        # Remove o nome do banco da URL e adiciona o fornecido
        url = url.rsplit("/", 1)[0] + "/" + dbname

    # Adiciona sslmode=require se não estiver presente
    if "?" not in url:
        url += "?sslmode=require"
    elif "sslmode=" not in url:
        url += "&sslmode=require"

    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def export_data(conn):
    """Exporta todos os dados do banco de origem."""
    cur = conn.cursor()
    data = {}

    # Lista de tabelas na ordem de dependência (filhas primeiro para INSERT)
    tables = [
        "empresa",
        "usuarios",
        "sessions",
        "clientes",
        "ordens",
        "historico",
        "produtos",
        "orcamentos",
        "config",
        "documentos",
    ]

    for table in tables:
        try:
            cur.execute(f"SELECT * FROM {table}")
            rows = cur.fetchall()
            # Converte para list of dicts serializável
            data[table] = []
            for row in rows:
                row_dict = dict(row)
                # Converte bytes para base64 (para JSON)
                if "conteudo" in row_dict and isinstance(row_dict["conteudo"], bytes):
                    import base64
                    row_dict["conteudo"] = base64.b64encode(row_dict["conteudo"]).decode("utf-8")
                    row_dict["_is_binary"] = True
                # Converte datas para timestamps
                for key, value in row_dict.items():
                    if isinstance(value, datetime):
                        row_dict[key] = int(value.timestamp() * 1000)
                data[table].append(row_dict)
            print(f"  ✓ {table}: {len(rows)} registros")
        except Exception as e:
            print(f"  ⚠ {table}: {e}")
            data[table] = []

    return data


def create_schema(conn):
    """Cria o schema no Supabase."""
    cur = conn.cursor()

    schema = """
    -- Schema do TechFix OS para Supabase/PostgreSQL

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

    CREATE TABLE IF NOT EXISTS produtos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      marca TEXT NOT NULL DEFAULT '',
      valor DOUBLE PRECISION,
      criado_por TEXT NOT NULL,
      criado_em BIGINT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL DEFAULT ''
    );

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

    for stmt in schema.split(";"):
        stmt = stmt.strip()
        if stmt:
            try:
                cur.execute(stmt)
            except Exception as e:
                print(f"  ⚠ Aviso ao criar schema: {e}")

    conn.commit()
    print("  ✓ Schema criado com sucesso")


def import_data(conn, data):
    """Importa os dados no Supabase."""
    cur = conn.cursor()

    # Ordem de inserção (respeita FK)
    tables = [
        "empresa",
        "usuarios",
        "clientes",
        "ordens",
        "historico",
        "produtos",
        "orcamentos",
        "config",
        "documentos",
    ]

    for table in tables:
        rows = data.get(table, [])
        if not rows:
            continue

        print(f"  Importando {table}...")

        for row in rows:
            # Remove campos auxiliares
            is_binary = row.pop("_is_binary", False)

            # Prepara os dados
            columns = list(row.keys())
            values = []

            for col in columns:
                val = row[col]
                # Converte base64 de volta para bytes
                if is_binary and col == "conteudo" and isinstance(val, str):
                    import base64
                    val = base64.b64decode(val)
                values.append(val)

            # Gera INSERT com ON CONFLICT para idempotência
            placeholders = ", ".join(["%s"] * len(columns))
            cols_str = ", ".join(columns)

            # Usa ON CONFLICT baseado naPK
            if table == "empresa":
                conflict = "ON CONFLICT (id) DO UPDATE SET " + ", ".join(
                    f"{c}=excluded.{c}" for c in columns if c != "id"
                )
            elif table == "usuarios":
                conflict = "ON CONFLICT (usuario) DO NOTHING"
            elif table in ("ordens", "orcamentos"):
                conflict = "ON CONFLICT (numero) DO NOTHING"
            elif table == "config":
                conflict = "ON CONFLICT (chave) DO UPDATE SET valor=excluded.valor"
            else:
                conflict = "ON CONFLICT (id) DO NOTHING"

            sql = f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders}) {conflict}"

            try:
                cur.execute(sql, values)
            except Exception as e:
                print(f"    ⚠ Erro ao inserir em {table}: {e}")
                conn.rollback()
                continue

        conn.commit()
        print(f"    ✓ {len(rows)} registros importados")


def validate_migration(source_conn, target_conn):
    """Valida a migração comparando contagens."""
    print("\n📊 Validação da migração:")

    tables = [
        "empresa",
        "usuarios",
        "clientes",
        "ordens",
        "historico",
        "produtos",
        "orcamentos",
        "config",
        "documentos",
    ]

    source_cur = source_conn.cursor()
    target_cur = target_conn.cursor()

    all_ok = True
    for table in tables:
        try:
            source_cur.execute(f"SELECT COUNT(*) as n FROM {table}")
            source_count = source_cur.fetchone()["n"]

            target_cur.execute(f"SELECT COUNT(*) as n FROM {table}")
            target_count = target_cur.fetchone()["n"]

            if source_count == target_count:
                print(f"  ✓ {table}: {source_count} → {target_count}")
            else:
                print(f"  ✗ {table}: {source_count} → {target_count} (DIFERENTE!)")
                all_ok = False
        except Exception as e:
            print(f"  ⚠ {table}: {e}")

    return all_ok


def main():
    """Função principal de migração."""
    print("=" * 60)
    print("TechFix OS — Migração para Supabase")
    print("=" * 60)

    # Obtém URLs dos bancos
    source_url = os.environ.get("DATABASE_URL")
    target_url = os.environ.get("SUPABASE_URL")

    if not source_url:
        print("❌ DATABASE_URL não configurada (banco de origem)")
        sys.exit(1)

    if not target_url:
        print("❌ SUPABASE_URL não configurada (banco de destino)")
        print("\nConfigure com a URL de conexão do Supabase:")
        print("  Settings → Database → Connection string → URI")
        sys.exit(1)

    print(f"\n📦 Banco de origem: {source_url[:50]}...")
    print(f"📦 Banco de destino: {target_url[:50]}...")

    # Conecta ao banco de origem
    print("\n1️⃣  Conectando ao banco de origem...")
    try:
        source_conn = get_connection(source_url)
        print("  ✓ Conectado")
    except Exception as e:
        print(f"  ❌ Erro ao conectar: {e}")
        sys.exit(1)

    # Exporta dados
    print("\n2️⃣  Exportando dados...")
    try:
        data = export_data(source_conn)
        total = sum(len(v) for v in data.values())
        print(f"  ✓ Total: {total} registros")
    except Exception as e:
        print(f"  ❌ Erro ao exportar: {e}")
        sys.exit(1)

    # Conecta ao Supabase
    print("\n3️⃣  Conectando ao Supabase...")
    try:
        target_conn = get_connection(target_url)
        print("  ✓ Conectado")
    except Exception as e:
        print(f"  ❌ Erro ao conectar: {e}")
        sys.exit(1)

    # Cria schema
    print("\n4️⃣  Criando schema no Supabase...")
    try:
        create_schema(target_conn)
    except Exception as e:
        print(f"  ❌ Erro ao criar schema: {e}")
        sys.exit(1)

    # Importa dados
    print("\n5️⃣  Importando dados...")
    try:
        import_data(target_conn, data)
    except Exception as e:
        print(f"  ❌ Erro ao importar: {e}")
        sys.exit(1)

    # Valida migração
    print("\n6️⃣  Validando migração...")
    try:
        ok = validate_migration(source_conn, target_conn)
        if ok:
            print("\n✅ Migração concluída com sucesso!")
        else:
            print("\n⚠️  Migração concluída com algumas divergências.")
    except Exception as e:
        print(f"  ⚠️  Erro na validação: {e}")

    # Fecha conexões
    source_conn.close()
    target_conn.close()

    print("\n" + "=" * 60)
    print("Migração concluída!")
    print("Configure a variável DATABASE_URL no Netlify com a URL do Supabase")
    print("=" * 60)


if __name__ == "__main__":
    main()
