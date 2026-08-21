"""TechFix OS — Servidor (Flask + SQLite + bcrypt).

Roda a API REST e serve a UI estática do projeto na mesma origem.
Sessão: cookie HttpOnly `techfix_sid` (ver server/auth.py).
"""
import base64
import hashlib
import io
import json
import os
import re
import sys

from flask import Flask, g, jsonify, make_response, request, send_file, send_from_directory

from .auth import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    can,
    create_session,
    csrf_ok,
    csrf_token,
    destroy_session,
    destroy_user_sessions,
    get_session_user,
    hash_password,
    login_limiter,
    require_auth,
    require_perm,
    verify_password,
)
from .db import (
    ORC_CAMPOS_VALIDOS,
    PROJECT_ROOT,
    bootstrap_payload,
    close_db,
    gerar_numero,
    gerar_numero_orc,
    get_db,
    get_orcamento_full,
    get_ordem_full,
    init_db,
    now_ms,
    orc_modelo_payload,
    orcamentos_payload,
    ordens_payload,
    row_cliente,
    row_empresa,
    row_orcamento,
    row_produto,
    row_user,
    uid,
    UPSERT_EMPRESA,
)

app = Flask(__name__)
app.json.ensure_ascii = False
app.teardown_appcontext(close_db)


@app.before_request
def csrf_protect():
    """Proteção CSRF (double-submit) para todos os métodos mutáveis.

    Isenta login/logout e o modo TESTING (suíte legada) — ver server/auth.py.
    """
    if not csrf_ok():
        return fail("Token CSRF inválido ou ausente.", 403)

# Raiz da UI estática: quando empacotado (PyInstaller onefile), os assets ficam
# no diretório temporário de extração (sys._MEIPASS); em dev, no repositório.
UI_ROOT = getattr(sys, "_MEIPASS", None) or PROJECT_ROOT

STATUS_LABELS = {
    "aberta": "Aberta",
    "em_andamento": "Em andamento",
    "aguardando": "Aguardando peça",
    "concluida": "Concluída",
    "cancelada": "Cancelada",
}
STATUS_TRANSITIONS = {
    "aberta": {"em_andamento", "cancelada"},
    "em_andamento": {"aguardando", "concluida"},
    "aguardando": {"em_andamento", "concluida"},
    "concluida": {"em_andamento"},
    "cancelada": {"aberta"},
}
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,}$")
# Transições de status do orçamento (aprovado/recusado podem ser reabertos)
ORC_STATUS_TRANSITIONS = {
    "aberto": {"aprovado", "recusado"},
    "aprovado": {"aberto"},
    "recusado": {"aberto"},
}
# Logo da empresa: data URL de imagem raster (PNG/JPG/GIF/WebP), até ~1 MB.
LOGO_RE = re.compile(r"^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$")
MAX_LOGO_CHARS = 1_500_000
LOGO_MIME = {"png": "image/png", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}


def fail(msg, code=400):
    return jsonify({"erro": msg}), code


# ===========================================================================
# Autenticação
# ===========================================================================

@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    usuario = str(data.get("usuario", "")).strip().lower()
    senha = str(data.get("senha", ""))
    if not usuario or not senha:
        return fail("Informe usuário e senha.", 400)
    ip = request.remote_addr or "?"
    if login_limiter.blocked(ip, usuario):
        return fail(
            "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.", 429
        )
    db = get_db()
    u = db.execute(
        "SELECT * FROM usuarios WHERE lower(usuario)=?", (usuario,)
    ).fetchone()
    if not u or not verify_password(senha, u["senha_hash"]):
        login_limiter.record_failure(ip, usuario)
        return fail("Usuário ou senha inválidos.", 401)
    if not u["ativo"]:
        return fail("Este usuário está desativado. Contate o administrador.", 403)
    login_limiter.reset(ip, usuario)
    token = create_session(u["id"])
    resp = make_response(jsonify(row_user(u)))
    resp.set_cookie(
        SESSION_COOKIE, token,
        max_age=7 * 24 * 3600, httponly=True, samesite="Lax",
        # Secure sob HTTPS (Netlify/Supabase) — local (HTTP) permanece sem o atributo
        secure=request.is_secure, path="/",
    )
    # Token CSRF legível pelo JS (double-submit) com a mesma validade da sessão
    resp.set_cookie(
        CSRF_COOKIE, csrf_token(),
        max_age=7 * 24 * 3600, httponly=False, samesite="Lax",
        secure=request.is_secure, path="/",
    )
    return resp


@app.post("/api/auth/logout")
def logout():
    destroy_session(request.cookies.get(SESSION_COOKIE))
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


@app.get("/api/auth/me")
@require_auth
def me():
    resp = make_response(jsonify(g.user))
    # Renova/garante o cookie CSRF a cada boot (autocura se o browser o perder)
    resp.set_cookie(
        CSRF_COOKIE, csrf_token(),
        max_age=7 * 24 * 3600, httponly=False, samesite="Lax",
        secure=request.is_secure, path="/",
    )
    return resp


# ===========================================================================
# Bootstrap / dados
# ===========================================================================

@app.get("/api/bootstrap")
@require_auth
def bootstrap():
    return jsonify(bootstrap_payload())


# ===========================================================================
# Usuários (admin)
# ===========================================================================

def count_other_active_admins(db, excl_id):
    return db.execute(
        "SELECT COUNT(*) c FROM usuarios WHERE id<>? AND role='admin' AND ativo=1",
        (excl_id,),
    ).fetchone()["c"]


@app.get("/api/usuarios")
@require_perm("usuarios:gerenciar")
def list_usuarios():
    db = get_db()
    rows = db.execute("SELECT * FROM usuarios ORDER BY nome").fetchall()
    return jsonify([row_user(r) for r in rows])


@app.post("/api/usuarios")
@require_perm("usuarios:gerenciar")
def add_usuario():
    data = request.get_json(silent=True) or {}
    nome = str(data.get("nome", "")).strip()
    usuario = str(data.get("usuario", "")).strip().lower()
    senha = str(data.get("senha", ""))
    role = data.get("role") if data.get("role") in ("admin", "tecnico") else "tecnico"
    if not nome:
        return fail("Informe o nome do usuário.")
    if not USERNAME_RE.match(usuario):
        return fail("Login inválido: use ao menos 3 letras ou números.")
    if len(senha) < 4:
        return fail("A senha deve ter pelo menos 4 caracteres.")
    db = get_db()
    if db.execute("SELECT 1 FROM usuarios WHERE lower(usuario)=?", (usuario,)).fetchone():
        return fail("Este login já está em uso.", 409)
    user = {
        "id": uid(), "nome": nome, "usuario": usuario,
        "senha_hash": hash_password(senha), "role": role,
        "ativo": 1, "criado_em": now_ms(),
    }
    db.execute(
        "INSERT INTO usuarios (id,nome,usuario,senha_hash,role,ativo,criado_em) VALUES (?,?,?,?,?,?,?)",
        (user["id"], user["nome"], user["usuario"], user["senha_hash"],
         user["role"], user["ativo"], user["criado_em"]),
    )
    db.commit()
    return jsonify(row_user(user)), 201


@app.patch("/api/usuarios/<user_id>")
@require_perm("usuarios:gerenciar")
def update_usuario(user_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    u = db.execute("SELECT * FROM usuarios WHERE id=?", (user_id,)).fetchone()
    if not u:
        return fail("Usuário não encontrado.", 404)
    nome = str(data.get("nome", "")).strip()
    role = data.get("role")
    ativo = data.get("ativo")
    if nome:
        db.execute("UPDATE usuarios SET nome=? WHERE id=?", (nome, user_id))
    if role in ("admin", "tecnico") and role != u["role"]:
        if u["role"] == "admin" and count_other_active_admins(db, user_id) == 0:
            return fail("Não é possível rebaixar o último administrador ativo.")
        db.execute("UPDATE usuarios SET role=? WHERE id=?", (role, user_id))
    if isinstance(ativo, bool) and ativo != bool(u["ativo"]):
        if not ativo and u["role"] == "admin" and count_other_active_admins(db, user_id) == 0:
            return fail("Não é possível desativar o último administrador ativo.")
        db.execute("UPDATE usuarios SET ativo=? WHERE id=?", (1 if ativo else 0, user_id))
        if not ativo:
            destroy_user_sessions(user_id)
    db.commit()
    return jsonify(row_user(db.execute("SELECT * FROM usuarios WHERE id=?", (user_id,)).fetchone()))


@app.delete("/api/usuarios/<user_id>")
@require_perm("usuarios:gerenciar")
def delete_usuario(user_id):
    db = get_db()
    u = db.execute("SELECT * FROM usuarios WHERE id=?", (user_id,)).fetchone()
    if not u:
        return fail("Usuário não encontrado.", 404)
    if g.user["id"] == user_id:
        return fail("Você não pode excluir o próprio usuário.")
    if u["role"] == "admin" and u["ativo"] and count_other_active_admins(db, user_id) == 0:
        return fail("Não é possível excluir o último administrador ativo.")
    destroy_user_sessions(user_id)
    db.execute("DELETE FROM usuarios WHERE id=?", (user_id,))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/usuarios/<user_id>/senha")
@require_perm("usuarios:gerenciar")
def set_usuario_senha(user_id):
    data = request.get_json(silent=True) or {}
    nova = str(data.get("nova", ""))
    db = get_db()
    if not db.execute("SELECT 1 FROM usuarios WHERE id=?", (user_id,)).fetchone():
        return fail("Usuário não encontrado.", 404)
    if len(nova) < 4:
        return fail("A senha deve ter pelo menos 4 caracteres.")
    db.execute("UPDATE usuarios SET senha_hash=? WHERE id=?", (hash_password(nova), user_id))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/me/senha")
@require_auth
def change_my_senha():
    data = request.get_json(silent=True) or {}
    atual = str(data.get("atual", ""))
    nova = str(data.get("nova", ""))
    db = get_db()
    u = db.execute("SELECT * FROM usuarios WHERE id=?", (g.user["id"],)).fetchone()
    if not verify_password(atual, u["senha_hash"]):
        return fail("Senha atual incorreta.")
    if len(nova) < 4:
        return fail("A senha deve ter pelo menos 4 caracteres.")
    db.execute("UPDATE usuarios SET senha_hash=? WHERE id=?", (hash_password(nova), u["id"]))
    db.commit()
    return jsonify({"ok": True})


# ===========================================================================
# Clientes
# ===========================================================================

@app.get("/api/clientes")
@require_auth
def list_clientes():
    db = get_db()
    rows = db.execute("SELECT * FROM clientes ORDER BY nome").fetchall()
    return jsonify([row_cliente(r) for r in rows])


@app.post("/api/clientes")
@require_perm("cli:criar")
def add_cliente():
    data = request.get_json(silent=True) or {}
    nome = str(data.get("nome", "")).strip()
    if not nome:
        return fail("Informe o nome do cliente.")
    c = {
        "id": uid(), "nome": nome,
        "telefone": str(data.get("telefone", "")).strip(),
        "email": str(data.get("email", "")).strip(),
        "endereco": str(data.get("endereco", "")).strip(),
        "criado_em": now_ms(),
    }
    db = get_db()
    db.execute(
        "INSERT INTO clientes (id,nome,telefone,email,endereco,criado_em) VALUES (?,?,?,?,?,?)",
        (c["id"], c["nome"], c["telefone"], c["email"], c["endereco"], c["criado_em"]),
    )
    db.commit()
    return jsonify(row_cliente(c)), 201


@app.patch("/api/clientes/<cliente_id>")
@require_perm("cli:editar")
def update_cliente(cliente_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    c = db.execute("SELECT * FROM clientes WHERE id=?", (cliente_id,)).fetchone()
    if not c:
        return fail("Cliente não encontrado.", 404)
    nome = str(data.get("nome", "")).strip()
    if not nome:
        return fail("Informe o nome do cliente.")
    db.execute(
        "UPDATE clientes SET nome=?, telefone=?, email=?, endereco=? WHERE id=?",
        (nome,
         str(data.get("telefone", "")).strip(),
         str(data.get("email", "")).strip(),
         str(data.get("endereco", "")).strip(),
         cliente_id),
    )
    db.commit()
    return jsonify(row_cliente(db.execute("SELECT * FROM clientes WHERE id=?", (cliente_id,)).fetchone()))


@app.delete("/api/clientes/<cliente_id>")
@require_perm("cli:excluir")
def delete_cliente(cliente_id):
    db = get_db()
    c = db.execute("SELECT * FROM clientes WHERE id=?", (cliente_id,)).fetchone()
    if not c:
        return fail("Cliente não encontrado.", 404)
    if db.execute("SELECT COUNT(*) n FROM ordens WHERE cliente_id=?", (cliente_id,)).fetchone()["n"] > 0:
        return fail("Este cliente possui ordens de serviço vinculadas e não pode ser excluído.", 409)
    db.execute("DELETE FROM clientes WHERE id=?", (cliente_id,))
    db.commit()
    return jsonify({"ok": True})


# ===========================================================================
# Ordens de serviço
# ===========================================================================

@app.get("/api/ordens")
@require_auth
def list_ordens():
    return jsonify(ordens_payload())


@app.get("/api/ordens/<ordem_id>")
@require_auth
def get_ordem(ordem_id):
    os = get_ordem_full(ordem_id)
    if not os:
        return fail("Ordem de serviço não encontrada.", 404)
    return jsonify(os)


@app.post("/api/ordens")
@require_perm("os:criar")
def add_ordem():
    data = request.get_json(silent=True) or {}
    cliente_id = str(data.get("clienteId", ""))
    equipamento = str(data.get("equipamento", "")).strip()
    descricao = str(data.get("descricao", "")).strip()
    prioridade = data.get("prioridade") if data.get("prioridade") in ("baixa", "media", "alta") else "media"
    db = get_db()
    if not db.execute("SELECT 1 FROM clientes WHERE id=?", (cliente_id,)).fetchone():
        return fail("Selecione um cliente válido.")
    if not equipamento:
        return fail("Informe o equipamento.")
    if not descricao:
        return fail("Descreva o serviço a ser realizado.")

    prazo_ms = None
    prazo = str(data.get("prazo") or "").strip()
    if prazo:
        try:
            from datetime import datetime
            prazo_ms = int(datetime.fromisoformat(prazo + "T23:59:59").timestamp() * 1000)
        except ValueError:
            return fail("Prazo inválido.")

    valor_estimado = data.get("valorEstimado")
    if valor_estimado in (None, ""):
        valor_estimado = None
    else:
        try:
            valor_estimado = float(valor_estimado)
        except (TypeError, ValueError):
            valor_estimado = None

    observacoes = str(data.get("observacoes", "")).strip()
    tecnico = str(data.get("tecnico", "")).strip() or g.user["nome"]
    oid = uid()
    numero = gerar_numero(db)
    agora = now_ms()
    db.execute(
        "INSERT INTO ordens (id,numero,cliente_id,equipamento,marca,serie,descricao,prioridade,status,"
        "valor_estimado,valor_final,data_abertura,data_conclusao,prazo,tecnico,observacoes) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (oid, numero, cliente_id, equipamento, str(data.get("marca", "")).strip(),
         str(data.get("serie", "")).strip(), descricao, prioridade, "aberta",
         valor_estimado, None, agora, None, prazo_ms, tecnico, observacoes),
    )
    db.execute(
        "INSERT INTO historico (id,ordem_id,data,status,titulo,nota) VALUES (?,?,?,?,?,?)",
        (uid(), oid, agora, "aberta", "Ordem de serviço criada", observacoes),
    )
    db.commit()
    return jsonify(get_ordem_full(oid)), 201


@app.delete("/api/ordens/<ordem_id>")
@require_perm("os:excluir")
def delete_ordem(ordem_id):
    db = get_db()
    if not db.execute("SELECT 1 FROM ordens WHERE id=?", (ordem_id,)).fetchone():
        return fail("Ordem de serviço não encontrada.", 404)
    db.execute("DELETE FROM ordens WHERE id=?", (ordem_id,))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/ordens/<ordem_id>/nota")
@require_perm("os:avancar")
def add_nota(ordem_id):
    data = request.get_json(silent=True) or {}
    nota = str(data.get("nota", "")).strip()
    db = get_db()
    os = db.execute("SELECT * FROM ordens WHERE id=?", (ordem_id,)).fetchone()
    if not os:
        return fail("Ordem de serviço não encontrada.", 404)
    if not nota:
        return fail("Escreva uma anotação antes de adicionar.")
    db.execute(
        "INSERT INTO historico (id,ordem_id,data,status,titulo,nota) VALUES (?,?,?,?,?,?)",
        (uid(), ordem_id, now_ms(), os["status"], "Anotação adicionada", nota),
    )
    db.commit()
    return jsonify(get_ordem_full(ordem_id))


@app.post("/api/ordens/<ordem_id>/status")
@require_perm("os:avancar")
def avancar_status(ordem_id):
    data = request.get_json(silent=True) or {}
    novo = str(data.get("novo", ""))
    nota = str(data.get("nota", "")).strip()
    valor_final = data.get("valorFinal")
    db = get_db()
    os = db.execute("SELECT * FROM ordens WHERE id=?", (ordem_id,)).fetchone()
    if not os:
        return fail("Ordem de serviço não encontrada.", 404)
    if novo not in STATUS_TRANSITIONS.get(os["status"], set()):
        return fail("Transição de status inválida.")
    if novo == "cancelada" and not can(g.user["role"], "os:cancelar"):
        return fail("Apenas administradores podem cancelar ordens.", 403)
    if novo == "concluida" and not can(g.user["role"], "os:finalizar"):
        return fail("Acesso restrito.", 403)

    agora = now_ms()
    db.execute(
        "INSERT INTO historico (id,ordem_id,data,status,titulo,nota) VALUES (?,?,?,?,?,?)",
        (uid(), ordem_id, agora, novo, "Status: " + STATUS_LABELS.get(novo, novo), nota),
    )
    if novo == "concluida":
        if valor_final is not None and valor_final != "":
            try:
                vf = float(valor_final)
                db.execute("UPDATE ordens SET status=?, data_conclusao=?, valor_final=? WHERE id=?",
                           (novo, agora, vf, ordem_id))
            except (TypeError, ValueError):
                db.execute("UPDATE ordens SET status=?, data_conclusao=? WHERE id=?", (novo, agora, ordem_id))
        else:
            db.execute("UPDATE ordens SET status=?, data_conclusao=? WHERE id=?", (novo, agora, ordem_id))
    else:
        # saiu de concluída (reaberta/retomada) ou outra transição: limpa dados de conclusão
        db.execute(
            "UPDATE ordens SET status=?, data_conclusao=NULL, valor_final=NULL WHERE id=?",
            (novo, ordem_id),
        )
    db.commit()
    return jsonify(get_ordem_full(ordem_id))


# ===========================================================================
# Produtos (catálogo reutilizado na OS e nos orçamentos)
# ===========================================================================

@app.get("/api/produtos")
@require_auth
def list_produtos():
    db = get_db()
    rows = db.execute("SELECT * FROM produtos ORDER BY nome").fetchall()
    return jsonify([row_produto(r) for r in rows])


@app.post("/api/produtos")
@require_perm("prod:criar")
def add_produto():
    data = request.get_json(silent=True) or {}
    nome = str(data.get("nome", "")).strip()
    if not nome:
        return fail("Informe o nome do produto.")
    valor = data.get("valor")
    if valor in (None, ""):
        valor = None
    else:
        try:
            valor = float(valor)
        except (TypeError, ValueError):
            return fail("Valor do produto inválido.")
        if valor < 0:
            return fail("Valor do produto inválido.")
    p = {
        "id": uid(), "nome": nome,
        "marca": str(data.get("marca", "")).strip(),
        "valor": valor, "criado_por": g.user["id"], "criado_em": now_ms(),
    }
    db = get_db()
    db.execute(
        "INSERT INTO produtos (id,nome,marca,valor,criado_por,criado_em) VALUES (?,?,?,?,?,?)",
        (p["id"], p["nome"], p["marca"], p["valor"], p["criado_por"], p["criado_em"]),
    )
    db.commit()
    return jsonify(row_produto(p)), 201


@app.patch("/api/produtos/<produto_id>")
@require_perm("prod:editar")
def update_produto(produto_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    p = db.execute("SELECT * FROM produtos WHERE id=?", (produto_id,)).fetchone()
    if not p:
        return fail("Produto não encontrado.", 404)
    nome = str(data.get("nome", "")).strip()
    if not nome:
        return fail("Informe o nome do produto.")
    valor = data.get("valor")
    if valor in (None, ""):
        valor = None
    else:
        try:
            valor = float(valor)
        except (TypeError, ValueError):
            return fail("Valor do produto inválido.")
        if valor < 0:
            return fail("Valor do produto inválido.")
    db.execute(
        "UPDATE produtos SET nome=?, marca=?, valor=? WHERE id=?",
        (nome, str(data.get("marca", "")).strip(), valor, produto_id),
    )
    db.commit()
    return jsonify(row_produto(db.execute("SELECT * FROM produtos WHERE id=?", (produto_id,)).fetchone()))


@app.delete("/api/produtos/<produto_id>")
@require_perm("prod:excluir")
def delete_produto(produto_id):
    db = get_db()
    if not db.execute("SELECT 1 FROM produtos WHERE id=?", (produto_id,)).fetchone():
        return fail("Produto não encontrado.", 404)
    db.execute("DELETE FROM produtos WHERE id=?", (produto_id,))
    db.commit()
    return jsonify({"ok": True})


# ===========================================================================
# Orçamentos
# ===========================================================================

def parse_validade(val):
    """Converte uma data YYYY-MM-DD (inserida manualmente pelo técnico)
    para o fim do dia em ms. Devolve None se vazia ou inválida."""
    val = str(val or "").strip()
    if not val:
        return None
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(val + "T23:59:59").timestamp() * 1000)
    except ValueError:
        return None


def parse_itens(data):
    """Valida e normaliza a lista de itens do orçamento.
    Cada item: {produtoId?, produto, marca?, valor, qtd}."""
    raw = data.get("itens")
    if not isinstance(raw, list) or not raw:
        return None
    out = []
    for it in raw:
        if not isinstance(it, dict):
            return None
        nome = str(it.get("produto", "")).strip()
        if not nome:
            return None
        try:
            valor = float(it.get("valor"))
            qtd = int(it.get("qtd") or 1)
        except (TypeError, ValueError):
            return None
        if valor < 0 or qtd < 1:
            return None
        out.append({
            "produtoId": str(it.get("produtoId", "")).strip(),
            "produto": nome,
            "marca": str(it.get("marca", "")).strip(),
            "valor": round(valor, 2),
            "qtd": qtd,
        })
    return out


@app.get("/api/orcamentos")
@require_auth
def list_orcamentos():
    return jsonify(orcamentos_payload())


@app.get("/api/orcamentos/<orc_id>")
@require_auth
def get_orcamento(orc_id):
    orc = get_orcamento_full(orc_id)
    if not orc:
        return fail("Orçamento não encontrado.", 404)
    return jsonify(orc)


@app.post("/api/orcamentos")
@require_perm("orc:criar")
def add_orcamento():
    data = request.get_json(silent=True) or {}
    cliente_id = str(data.get("clienteId", ""))
    db = get_db()
    if not db.execute("SELECT 1 FROM clientes WHERE id=?", (cliente_id,)).fetchone():
        return fail("Selecione um cliente válido.")
    validade = parse_validade(data.get("validade"))
    if not validade:
        return fail("Informe a data de validade do orçamento.")
    itens = parse_itens(data)
    if itens is None:
        return fail("Adicione ao menos um item com produto e valor válidos.")
    oid = uid()
    numero = gerar_numero_orc(db)
    agora = now_ms()
    valor_total = round(sum(i["valor"] * i["qtd"] for i in itens), 2)
    db.execute(
        "INSERT INTO orcamentos (id,numero,cliente_id,tecnico,descricao,itens,valor_total,"
        "validade,status,observacoes,condicoes,criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (oid, numero, cliente_id,
         str(data.get("tecnico", "")).strip() or g.user["nome"],
         str(data.get("descricao", "")).strip(),
         json.dumps(itens, ensure_ascii=False),
         valor_total, validade, "aberto",
         str(data.get("observacoes", "")).strip(),
         str(data.get("condicoes", "")).strip(),
         agora),
    )
    db.commit()
    return jsonify(get_orcamento_full(oid)), 201


@app.patch("/api/orcamentos/<orc_id>")
@require_perm("orc:editar")
def update_orcamento(orc_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    o = db.execute("SELECT * FROM orcamentos WHERE id=?", (orc_id,)).fetchone()
    if not o:
        return fail("Orçamento não encontrado.", 404)
    cliente_id = str(data.get("clienteId", o["cliente_id"]))
    if not db.execute("SELECT 1 FROM clientes WHERE id=?", (cliente_id,)).fetchone():
        return fail("Selecione um cliente válido.")
    validade = parse_validade(data.get("validade")) or o["validade"]
    itens = parse_itens(data)
    if itens is None:
        try:
            itens = json.loads(o["itens"]) if o["itens"] else []
        except (TypeError, ValueError):
            itens = []
    valor_total = round(sum(i["valor"] * i["qtd"] for i in itens), 2)
    def _txt(key, atual):
        v = data.get(key, atual)
        return str(v).strip() if v is not None else atual
    db.execute(
        "UPDATE orcamentos SET cliente_id=?, tecnico=?, descricao=?, itens=?, valor_total=?,"
        "validade=?, observacoes=?, condicoes=? WHERE id=?",
        (cliente_id,
         _txt("tecnico", o["tecnico"]),
         _txt("descricao", o["descricao"]),
         json.dumps(itens, ensure_ascii=False),
         valor_total, validade,
         _txt("observacoes", o["observacoes"]),
         _txt("condicoes", o["condicoes"]),
         orc_id),
    )
    db.commit()
    return jsonify(get_orcamento_full(orc_id))


@app.post("/api/orcamentos/<orc_id>/status")
@require_perm("orc:avancar")
def avancar_orcamento(orc_id):
    data = request.get_json(silent=True) or {}
    novo = str(data.get("novo", ""))
    db = get_db()
    o = db.execute("SELECT * FROM orcamentos WHERE id=?", (orc_id,)).fetchone()
    if not o:
        return fail("Orçamento não encontrado.", 404)
    if novo not in ORC_STATUS_TRANSITIONS.get(o["status"], set()):
        return fail("Transição de status inválida.")
    db.execute("UPDATE orcamentos SET status=? WHERE id=?", (novo, orc_id))
    db.commit()
    return jsonify(get_orcamento_full(orc_id))


@app.delete("/api/orcamentos/<orc_id>")
@require_perm("orc:excluir")
def delete_orcamento(orc_id):
    db = get_db()
    if not db.execute("SELECT 1 FROM orcamentos WHERE id=?", (orc_id,)).fetchone():
        return fail("Orçamento não encontrado.", 404)
    db.execute("DELETE FROM orcamentos WHERE id=?", (orc_id,))
    db.commit()
    return jsonify({"ok": True})


# ===========================================================================
# Documentos (PDFs salvos no histórico da OS / orçamento)
# ===========================================================================

def _add_documento(entidade, entidade_id):
    data = request.get_json(silent=True) or {}
    nome = str(data.get("nome", "")).strip()
    b64 = str(data.get("base64", ""))
    if not nome or not nome.lower().endswith(".pdf"):
        return fail("Nome do documento inválido.")
    if not b64:
        return fail("Conteúdo do documento vazio.")
    try:
        conteudo = base64.b64decode(b64)
    except (TypeError, ValueError):
        return fail("Conteúdo do documento inválido.")
    if not conteudo or conteudo[:4] != b"%PDF":
        return fail("O arquivo enviado não é um PDF válido.")
    db = get_db()
    tabela = "ordens" if entidade == "ordem" else "orcamentos"
    if not db.execute("SELECT 1 FROM %s WHERE id=?" % tabela, (entidade_id,)).fetchone():
        return fail("Registro não encontrado.", 404)
    doc = {"id": uid(), "nome": nome, "criado_por": g.user["id"], "criado_em": now_ms()}
    db.execute(
        "INSERT INTO documentos (id,entidade,entidade_id,nome,conteudo,criado_por,criado_em) VALUES (?,?,?,?,?,?,?)",
        (doc["id"], entidade, entidade_id, nome, conteudo, doc["criado_por"], doc["criado_em"]),
    )
    db.commit()
    return jsonify({"id": doc["id"], "nome": nome, "criadoPor": doc["criado_por"], "criadoEm": doc["criado_em"]}), 201


@app.post("/api/ordens/<ordem_id>/documentos")
@require_perm("os:imprimir")
def add_ordem_documento(ordem_id):
    return _add_documento("ordem", ordem_id)


@app.post("/api/orcamentos/<orc_id>/documentos")
@require_perm("orc:imprimir")
def add_orcamento_documento(orc_id):
    return _add_documento("orcamento", orc_id)


@app.get("/api/documentos/<doc_id>")
@require_auth
def get_documento(doc_id):
    db = get_db()
    d = db.execute("SELECT * FROM documentos WHERE id=?", (doc_id,)).fetchone()
    if not d:
        return fail("Documento não encontrado.", 404)
    resp = make_response(
        send_file(io.BytesIO(d["conteudo"]), mimetype="application/pdf",
                  as_attachment=True, download_name=d["nome"])
    )
    resp.headers["Cache-Control"] = "private, max-age=0"
    return resp


@app.delete("/api/documentos/<doc_id>")
@require_auth
def delete_documento(doc_id):
    db = get_db()
    d = db.execute("SELECT * FROM documentos WHERE id=?", (doc_id,)).fetchone()
    if not d:
        return fail("Documento não encontrado.", 404)
    perm = "os:excluir" if d["entidade"] == "ordem" else "orc:excluir"
    if not can(g.user["role"], perm):
        return fail("Acesso restrito.", 403)
    db.execute("DELETE FROM documentos WHERE id=?", (doc_id,))
    db.commit()
    return jsonify({"ok": True})


# ===========================================================================
# Modelo de impressão do orçamento (admin)
# ===========================================================================

@app.put("/api/config/orc-modelo")
@require_perm("orc:modelo")
def update_orc_modelo():
    data = request.get_json(silent=True) or {}
    campos = data.get("campos")
    if not isinstance(campos, list):
        campos = list(ORC_CAMPOS_VALIDOS)
    campos = [c for c in campos if c in ORC_CAMPOS_VALIDOS]
    db = get_db()
    for chave, valor in (
        ("orc_obs_padrao", str(data.get("obsPadrao", ""))),
        ("orc_rodape", str(data.get("rodape", ""))),
        ("orc_campos", json.dumps(campos, ensure_ascii=False)),
    ):
        db.execute(
            "INSERT INTO config (chave,valor) VALUES (?,?) "
            "ON CONFLICT (chave) DO UPDATE SET valor=excluded.valor",
            (chave, valor),
        )
    db.commit()
    return jsonify(orc_modelo_payload())


# ===========================================================================
# Empresa / sistema
# ===========================================================================

@app.put("/api/empresa")
@require_perm("rep:empresa")
def update_empresa():
    data = request.get_json(silent=True) or {}
    nome = str(data.get("nome", "")).strip()
    if not nome:
        return fail("Informe a razão social.")
    db = get_db()
    logo = data.get("logo", None)
    if logo is None:
        # chave ausente: preserva a logo atual (edição de outros campos)
        cur = db.execute("SELECT logo FROM empresa WHERE id=1").fetchone()
        logo = cur["logo"] if cur else ""
    elif logo == "":
        # vazio explícito: remove a logo
        logo = ""
    else:
        logo = str(logo).strip()
        if not LOGO_RE.match(logo) or len(logo) > MAX_LOGO_CHARS:
            return fail("Logo inválida: use PNG, JPG, GIF ou WebP de até ~1 MB.")
    # A logo é armazenada como data URL no banco: no Netlify o filesystem é
    # efêmero, então não há arquivo em disco.
    db.execute(
        UPSERT_EMPRESA,
        (nome,
         str(data.get("cnpj", "")).strip(),
         str(data.get("endereco", "")).strip(),
         str(data.get("telefone", "")).strip(),
         logo),
    )
    db.commit()
    return jsonify(row_empresa(db.execute("SELECT * FROM empresa WHERE id=1").fetchone()))


@app.get("/api/empresa/logo")
def get_logo():
    """Serve a logo da empresa (pública: login e relatórios) a partir do banco,
    com cache por Content-Type/ETag/Cache-Control."""
    db = get_db()
    emp = db.execute("SELECT logo FROM empresa WHERE id=1").fetchone()
    data_url = emp["logo"] if emp else ""
    m = re.match(r"^data:image/(png|jpeg|gif|webp);base64,(.*)$", data_url, re.S)
    if not m:
        return fail("Logotipo não definido.", 404)
    subtype, b64 = m.group(1), m.group(2)
    try:
        raw = base64.b64decode(b64)
    except (TypeError, ValueError):
        return fail("Logotipo não definido.", 404)
    if not raw:
        return fail("Logotipo não definido.", 404)
    resp = make_response(send_file(io.BytesIO(raw), mimetype=LOGO_MIME.get(subtype, "image/png")))
    resp.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
    resp.headers["ETag"] = '"%s"' % hashlib.sha256(data_url.encode("utf-8")).hexdigest()[:32]
    return resp


# ===========================================================================
# UI estática (mesma origem)
# ===========================================================================

@app.get("/")
def index():
    return send_from_directory(UI_ROOT, "index.html")


@app.get("/<path:path>")
def assets(path):
    if path == "index.html" or path.startswith("css/") or path.startswith("js/"):
        return send_from_directory(UI_ROOT, path)
    return fail("Recurso não encontrado.", 404)


def run():
    """Inicia o servidor — usado por `python -m server.app` e pelo exe
    empacotado (entry_server.py), que importa esta função."""
    with app.app_context():
        init_db()
    port = int(os.environ.get("PORT", 8432))
    # HOST=0.0.0.0 no Docker (imagem define o default); local permanece 127.0.0.1
    host = os.environ.get("HOST", "127.0.0.1")
    print("TechFix OS backend em http://%s:%d" % (host, port), flush=True)
    app.run(host=host, port=port, threaded=True, debug=False)


if __name__ == "__main__":
    run()
