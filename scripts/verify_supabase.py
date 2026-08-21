#!/usr/bin/env python3
"""Verificação da migração para Supabase."""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import psycopg2
import psycopg2.extras

url = os.environ.get('SUPABASE_URL')
if not url:
    print("❌ SUPABASE_URL não configurada")
    print("Configure com a URL de conexão do Supabase:")
    print("  Settings → Database → Connection string → URI")
    sys.exit(1)

conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print('=' * 60)
print('VERIFICACAO DO SUPABASE')
print('=' * 60)

tables = ['empresa', 'usuarios', 'clientes', 'ordens', 'historico', 'produtos', 'orcamentos', 'config', 'documentos']
total = 0

for table in tables:
    try:
        cur.execute(f'SELECT COUNT(*) as n FROM {table}')
        count = cur.fetchone()['n']
        total += count
        print(f'  OK {table}: {count} registros')
    except Exception as e:
        print(f'  ERRO {table}: {e}')

print(f'\n  Total: {total} registros')

# Verificar dados específicos
print('\n' + '=' * 60)
print('DADOS ESPECIFICOS')
print('=' * 60)

# Empresa
cur.execute('SELECT nome, cnpj FROM empresa WHERE id=1')
emp = cur.fetchone()
print(f'\n  Empresa: {emp["nome"]}')
print(f'  CNPJ: {emp["cnpj"]}')

# Usuários
cur.execute('SELECT nome, usuario, role FROM usuarios ORDER BY nome')
users = cur.fetchall()
print(f'\n  Usuarios ({len(users)}):')
for u in users:
    print(f'    - {u["nome"]} ({u["usuario"]}) - {u["role"]}')

# Produtos (primeiros 5)
cur.execute('SELECT nome, marca, valor FROM produtos ORDER BY nome LIMIT 5')
prods = cur.fetchall()
print(f'\n  Produtos (primeiros 5 de 20):')
for p in prods:
    valor = f'R$ {p["valor"]:.2f}' if p['valor'] else 'N/A'
    print(f'    - {p["nome"]} ({p["marca"]}) - {valor}')

# Documentos
cur.execute('SELECT nome, entidade, LENGTH(conteudo) as tamanho FROM documentos')
docs = cur.fetchall()
print(f'\n  Documentos ({len(docs)}):')
for d in docs:
    print(f'    - {d["nome"]} ({d["entidade"]}) - {d["tamanho"]} bytes')

conn.close()
print('\n' + '=' * 60)
print('Verificacao concluida com sucesso!')
print('=' * 60)
