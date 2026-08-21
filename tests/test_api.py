"""Testes da API do TechFix OS (pytest + Flask test client).

Cobrem: autenticação (login/sessão), permissões por perfil (admin/técnico),
CRUD de clientes e ordens e proteções de administrador.

O banco nasce limpo (apenas o usuário admin, senha padrão 123456, e os dados
da empresa) — perfis de técnico usados nos testes são criados via API.
"""

from datetime import datetime

ADMIN_PASS = "123456"


def login(client, usuario, senha):
    return client.post("/api/auth/login", json={"usuario": usuario, "senha": senha})


def login_admin(client):
    return login(client, "admin", ADMIN_PASS)


def criar_usuario(client, usuario="tecnico", senha="tec123", nome="Ana Souza", role="tecnico"):
    """Loga como admin e cria um usuário; devolve o id criado."""
    login_admin(client)
    res = client.post("/api/usuarios", json={
        "nome": nome, "usuario": usuario, "senha": senha, "role": role,
    })
    assert res.status_code == 201, res.get_json()
    return res.get_json()["id"]


def criar_tecnico(client):
    return criar_usuario(client)


def novo_cliente(client, nome="Cliente Teste"):
    """Cria um cliente (sessão atual precisa ter permissão) e devolve o id."""
    res = client.post("/api/clientes", json={"nome": nome})
    assert res.status_code == 201, res.get_json()
    return res.get_json()["id"]


def nova_ordem(client, cliente_id):
    res = client.post("/api/ordens", json={
        "clienteId": cliente_id, "equipamento": "Equipamento Teste", "descricao": "teste",
    })
    assert res.status_code == 201, res.get_json()
    return res.get_json()


# ===========================================================================
# Autenticação e sessão
# ===========================================================================

def test_login_admin_ok(client):
    res = login(client, "admin", ADMIN_PASS)
    assert res.status_code == 200
    data = res.get_json()
    assert data["nome"] == "Administrador"
    assert data["role"] == "admin"
    assert "senha" not in data  # hash nunca é exposto
    assert res.headers.get("Set-Cookie", "").startswith("techfix_sid=")


def test_login_tecnico_ok(client):
    criar_tecnico(client)
    res = login(client, "tecnico", "tec123")
    assert res.status_code == 200
    assert res.get_json()["role"] == "tecnico"


def test_login_wrong_password(client):
    res = login(client, "admin", "senha-errada")
    assert res.status_code == 401
    assert "inválidos" in res.get_json()["erro"]


def test_login_unknown_user(client):
    res = login(client, "nao.existe", "x123")
    assert res.status_code == 401


def test_login_inactive_user(client):
    # admin cria usuário e o desativa; login deve ser bloqueado com 403
    uid = criar_usuario(client, usuario="zeteste", senha="zet123", nome="Zé Teste")
    res = client.patch("/api/usuarios/" + uid, json={"ativo": False})
    assert res.status_code == 200
    blocked = login(client, "zeteste", "zet123")
    assert blocked.status_code == 403


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/bootstrap").status_code == 401


def test_bootstrap_returns_data(client):
    login_admin(client)
    res = client.get("/api/bootstrap")
    assert res.status_code == 200
    data = res.get_json()
    # banco limpo: sem ordens/clientes de demonstração
    assert data["ordens"] == []
    assert data["clientes"] == []
    assert data["empresa"]["nome"] == "TechFix Assistência Técnica"
    # usuários ativos são expostos como opções de técnico (Nova OS)
    assert any(t["nome"] == "Administrador" and t["id"] for t in data["tecnicos"])


def test_logout_invalidates_session(client):
    login_admin(client)
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


# ===========================================================================
# Permissões por perfil
# ===========================================================================

def test_tecnico_cannot_manage_usuarios(client):
    criar_tecnico(client)
    login(client, "tecnico", "tec123")
    assert client.get("/api/usuarios").status_code == 403
    assert client.post("/api/usuarios", json={
        "nome": "X", "usuario": "xxx", "senha": "xxxx", "role": "tecnico",
    }).status_code == 403


def test_tecnico_cannot_delete_ordem(client):
    login_admin(client)
    cli = novo_cliente(client)
    ordem = nova_ordem(client, cli)

    criar_tecnico(client)
    login(client, "tecnico", "tec123")
    assert client.delete("/api/ordens/" + ordem["id"]).status_code == 403
    assert client.post("/api/ordens/" + ordem["id"] + "/status", json={"novo": "cancelada"}).status_code == 403


def test_tecnico_can_advance_status(client):
    login_admin(client)
    cli = novo_cliente(client)
    ordem = nova_ordem(client, cli)

    criar_tecnico(client)
    login(client, "tecnico", "tec123")
    res = client.post("/api/ordens/" + ordem["id"] + "/status", json={"novo": "em_andamento"})
    assert res.status_code == 200
    assert res.get_json()["status"] == "em_andamento"


def test_tecnico_can_create_cliente(client):
    criar_tecnico(client)
    login(client, "tecnico", "tec123")
    res = client.post("/api/clientes", json={"nome": "Cliente Técnico"})
    assert res.status_code == 201


# ===========================================================================
# CRUD de clientes
# ===========================================================================

def test_cliente_crud_flow(client):
    login_admin(client)
    created = client.post("/api/clientes", json={
        "nome": "Empresa XYZ", "telefone": "(11) 1111-1111", "email": "x@y.com",
    })
    assert created.status_code == 201
    cid = created.get_json()["id"]

    updated = client.patch("/api/clientes/" + cid, json={"nome": "Empresa XYZ LTDA"})
    assert updated.status_code == 200
    assert updated.get_json()["nome"] == "Empresa XYZ LTDA"

    assert client.delete("/api/clientes/" + cid).status_code == 200


def test_cliente_com_ordens_nao_pode_excluir(client):
    login_admin(client)
    cli = novo_cliente(client, nome="Cliente XYZ")
    nova_ordem(client, cli)
    res = client.delete("/api/clientes/" + cli)
    assert res.status_code == 409
    assert "vinculadas" in res.get_json()["erro"]


def test_cliente_validation(client):
    login_admin(client)
    assert client.post("/api/clientes", json={"nome": "  "}).status_code == 400


# ===========================================================================
# CRUD de ordens de serviço
# ===========================================================================

def test_ordem_flow_completo(client):
    login_admin(client)
    cliente_id = novo_cliente(client, nome="Cliente OS")

    created = client.post("/api/ordens", json={
        "clienteId": cliente_id,
        "equipamento": "Notebook Teste",
        "descricao": "Serviço de teste",
        "prioridade": "alta",
        "valorEstimado": 199.9,
    })
    assert created.status_code == 201
    os = created.get_json()
    assert os["numero"].startswith("OS-%d-" % datetime.now().year)
    assert os["status"] == "aberta"
    assert len(os["historico"]) == 1

    # iniciar atendimento
    res = client.post("/api/ordens/" + os["id"] + "/status", json={"novo": "em_andamento", "nota": "iniciado"})
    assert res.get_json()["status"] == "em_andamento"

    # finalizar com valor
    res = client.post("/api/ordens/" + os["id"] + "/status", json={"novo": "concluida", "valorFinal": 220.5})
    body = res.get_json()
    assert body["status"] == "concluida"
    assert body["valorFinal"] == 220.5
    assert body["dataConclusao"] is not None

    # reabrir limpa dados de conclusão
    res = client.post("/api/ordens/" + os["id"] + "/status", json={"novo": "em_andamento"})
    body = res.get_json()
    assert body["status"] == "em_andamento"
    assert body["valorFinal"] is None
    assert body["dataConclusao"] is None


def test_ordem_transicao_invalida(client):
    login_admin(client)
    cliente_id = novo_cliente(client)
    os = nova_ordem(client, cliente_id)
    # aberta -> concluida não é permitida (precisa passar por em_andamento)
    res = client.post("/api/ordens/" + os["id"] + "/status", json={"novo": "concluida"})
    assert res.status_code == 400
    assert "inválida" in res.get_json()["erro"]


def test_ordem_validation(client):
    login_admin(client)
    res = client.post("/api/ordens", json={"clienteId": "inexistente", "equipamento": "X", "descricao": "y"})
    assert res.status_code == 400


# ===========================================================================
# Proteções de administrador
# ===========================================================================

def test_admin_nao_exclui_proprio_usuario(client):
    login_admin(client)
    me = client.get("/api/auth/me").get_json()
    res = client.delete("/api/usuarios/" + me["id"])
    assert res.status_code == 400
    assert "próprio" in res.get_json()["erro"]


def test_nao_rebaixa_ultimo_admin(client):
    login_admin(client)
    me = client.get("/api/auth/me").get_json()
    res = client.patch("/api/usuarios/" + me["id"], json={"role": "tecnico"})
    assert res.status_code == 400
    assert "último administrador" in res.get_json()["erro"]


def test_usuarios_protecoes_flow(client):
    login_admin(client)
    bruno = client.post("/api/usuarios", json={
        "nome": "Bruno Lima", "usuario": "bruno", "senha": "bruno123", "role": "tecnico",
    }).get_json()

    # login duplicado
    dup = client.post("/api/usuarios", json={
        "nome": "Outro", "usuario": "bruno", "senha": "xxxx", "role": "tecnico",
    })
    assert dup.status_code == 409

    # redefinir senha
    assert client.post("/api/usuarios/" + bruno["id"] + "/senha", json={"nova": "nova123"}).status_code == 200
    assert login(client, "bruno", "nova123").status_code == 200

    # excluir (volta a ser admin — o cookie atual é do bruno após o login acima)
    login_admin(client)
    assert client.delete("/api/usuarios/" + bruno["id"]).status_code == 200
    assert login(client, "bruno", "nova123").status_code == 401


def test_empresa_upsert(client):
    login_admin(client)
    res = client.put("/api/empresa", json={
        "nome": "TechFix Nova Razão",
        "cnpj": "00.000.000/0001-00",
        "endereco": "Rua Nova, 1",
        "telefone": "(11) 9999-9999",
    })
    assert res.status_code == 200
    assert res.get_json()["nome"] == "TechFix Nova Razão"
    # idempotente: repete o upsert sem erro
    assert client.put("/api/empresa", json={"nome": "TechFix Nova Razão"}).status_code == 200


def test_empresa_logo(client):
    login_admin(client)
    logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

    # gravar logo (data URL de imagem PNG) -> flag True + servida via GET
    res = client.put("/api/empresa", json={"nome": "TechFix", "logo": logo})
    assert res.status_code == 200
    assert res.get_json()["logo"] is True

    # bootstrap devolve apenas o flag (a imagem é servida por GET)
    data = client.get("/api/bootstrap").get_json()
    assert data["empresa"]["logo"] is True

    # logo armazenada no banco (no Netlify o filesystem é efêmero) e servida com cache
    resp = client.get("/api/empresa/logo")
    assert resp.status_code == 200
    assert resp.content_type == "image/png"
    assert "max-age" in resp.headers.get("Cache-Control", "")

    # editar outros campos sem enviar logo preserva a atual
    res = client.put("/api/empresa", json={"nome": "TechFix LTDA"})
    assert res.status_code == 200
    assert res.get_json()["logo"] is True
    assert client.get("/api/empresa/logo").status_code == 200

    # logo inválida (não é data URL de imagem) é rejeitada
    res = client.put("/api/empresa", json={"nome": "TechFix", "logo": "javascript:alert(1)"})
    assert res.status_code == 400
    assert "Logo inválida" in res.get_json()["erro"]

    # remover a logo
    res = client.put("/api/empresa", json={"nome": "TechFix", "logo": ""})
    assert res.status_code == 200
    assert res.get_json()["logo"] is False
    assert client.get("/api/empresa/logo").status_code == 404


def test_logo_rota_publica_sem_sessao(client):
    # a rota da logo é pública (aparece na tela de login): sem sessão, sem
    # logo definida -> 404 (e não 401, provando que não exige autenticação)
    assert client.get("/api/empresa/logo").status_code == 404


# ===========================================================================
# Produtos (catálogo)
# ===========================================================================

def novo_produto(client, nome="Fonte 12V 5A", marca="Corsair", valor=89.9):
    res = client.post("/api/produtos", json={"nome": nome, "marca": marca, "valor": valor})
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def test_produto_crud_flow(client):
    login_admin(client)
    p = novo_produto(client)
    assert p["nome"] == "Fonte 12V 5A"
    assert p["valor"] == 89.9
    assert p["criadoPor"]

    # aparece no bootstrap (usado na Nova OS e nos orçamentos)
    data = client.get("/api/bootstrap").get_json()
    assert any(x["id"] == p["id"] for x in data["produtos"])

    # editar
    up = client.patch("/api/produtos/" + p["id"], json={"nome": "Fonte 12V 6A", "valor": 99.9})
    assert up.status_code == 200
    assert up.get_json()["nome"] == "Fonte 12V 6A"

    # excluir (admin)
    assert client.delete("/api/produtos/" + p["id"]).status_code == 200
    assert client.get("/api/bootstrap").get_json()["produtos"] == []


def test_produto_validation(client):
    login_admin(client)
    assert client.post("/api/produtos", json={"nome": "  "}).status_code == 400
    assert client.post("/api/produtos", json={"nome": "X", "valor": -5}).status_code == 400
    assert client.post("/api/produtos", json={"nome": "X", "valor": "abc"}).status_code == 400


def test_tecnico_pode_cadastrar_e_editar_produto(client):
    criar_tecnico(client)
    login(client, "tecnico", "tec123")
    res = client.post("/api/produtos", json={"nome": "Memória 8GB", "marca": "Kingston"})
    assert res.status_code == 201
    pid = res.get_json()["id"]
    # pode editar (mantém o catálogo atualizado no dia a dia)
    up = client.patch("/api/produtos/" + pid, json={"nome": "Memória 16GB", "valor": 199.9})
    assert up.status_code == 200
    assert up.get_json()["nome"] == "Memória 16GB"
    # mas não pode excluir (apenas admin)
    assert client.delete("/api/produtos/" + pid).status_code == 403


# ===========================================================================
# Orçamentos
# ===========================================================================

def novo_orcamento(client, cliente_id, validade="2026-12-31", itens=None):
    itens = itens or [{"produto": "Fonte 12V 5A", "marca": "Corsair", "valor": 89.9, "qtd": 2}]
    res = client.post("/api/orcamentos", json={
        "clienteId": cliente_id, "validade": validade, "itens": itens,
        "descricao": "Troca da fonte", "condicoes": "50% entrada, 50% na entrega",
    })
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def test_orcamento_flow_completo(client):
    login_admin(client)
    cli = novo_cliente(client, nome="Cliente Orçamento")

    orc = novo_orcamento(client, cli)
    assert orc["numero"].startswith("ORC-%d-" % datetime.now().year)
    assert orc["status"] == "aberto"
    assert orc["valorTotal"] == 179.8  # 2 x 89.9
    assert len(orc["itens"]) == 1
    # validade manual convertida para fim do dia em ms
    from datetime import datetime as dt
    from datetime import time as dtime
    fim = int(dt.combine(dt(2026, 12, 31).date(), dtime(23, 59, 59)).timestamp() * 1000)
    assert orc["validade"] == fim

    # status: aprovar
    res = client.post("/api/orcamentos/" + orc["id"] + "/status", json={"novo": "aprovado"})
    assert res.get_json()["status"] == "aprovado"
    # recusar a partir de aprovado é inválido; reabrir é válido
    assert client.post("/api/orcamentos/" + orc["id"] + "/status", json={"novo": "recusado"}).status_code == 400
    res = client.post("/api/orcamentos/" + orc["id"] + "/status", json={"novo": "aberto"})
    assert res.get_json()["status"] == "aberto"
    # recusar
    res = client.post("/api/orcamentos/" + orc["id"] + "/status", json={"novo": "recusado"})
    assert res.get_json()["status"] == "recusado"

    # editar: troca cliente de itens e recalcula o total
    itens = [
        {"produto": "Fonte 12V 5A", "marca": "Corsair", "valor": 89.9, "qtd": 1},
        {"produto": "HD 1TB", "marca": "Seagate", "valor": 250.0, "qtd": 1},
    ]
    res = client.patch("/api/orcamentos/" + orc["id"], json={"validade": "2027-01-15", "itens": itens})
    body = res.get_json()
    assert body["valorTotal"] == 339.9
    assert len(body["itens"]) == 2
    assert body["status"] == "recusado"  # editar não muda o status

    # excluir (admin)
    assert client.delete("/api/orcamentos/" + orc["id"]).status_code == 200


def test_orcamento_validation(client):
    login_admin(client)
    cli = novo_cliente(client)
    # cliente inválido
    assert client.post("/api/orcamentos", json={"clienteId": "x", "validade": "2026-01-01", "itens": [{"produto": "A", "valor": 1}]}).status_code == 400
    # validade obrigatória (inserida manualmente pelo técnico)
    assert client.post("/api/orcamentos", json={"clienteId": cli, "validade": "", "itens": [{"produto": "A", "valor": 1}]}).status_code == 400
    assert client.post("/api/orcamentos", json={"clienteId": cli, "validade": "31/12/2026", "itens": [{"produto": "A", "valor": 1}]}).status_code == 400
    # sem itens ou item sem valor
    assert client.post("/api/orcamentos", json={"clienteId": cli, "validade": "2026-01-01", "itens": []}).status_code == 400
    assert client.post("/api/orcamentos", json={"clienteId": cli, "validade": "2026-01-01", "itens": [{"produto": "", "valor": 1}]}).status_code == 400
    assert client.post("/api/orcamentos", json={"clienteId": cli, "validade": "2026-01-01", "itens": [{"produto": "A"}]}).status_code == 400


def test_orcamento_transicao_invalida(client):
    login_admin(client)
    cli = novo_cliente(client)
    orc = novo_orcamento(client, cli)
    res = client.post("/api/orcamentos/" + orc["id"] + "/status", json={"novo": "cancelada"})
    assert res.status_code == 400
    assert "inválida" in res.get_json()["erro"]


def test_tecnico_pode_gerir_orcamentos(client):
    login_admin(client)
    cli = novo_cliente(client)
    criar_tecnico(client)
    login(client, "tecnico", "tec123")

    orc = novo_orcamento(client, cli)
    assert orc["numero"].startswith("ORC-")
    # técnico pode aprovar, mas não excluir
    assert client.post("/api/orcamentos/" + orc["id"] + "/status", json={"novo": "aprovado"}).status_code == 200
    assert client.delete("/api/orcamentos/" + orc["id"]).status_code == 403


def test_orcamento_no_bootstrap(client):
    login_admin(client)
    assert client.get("/api/bootstrap").get_json()["orcamentos"] == []
    cli = novo_cliente(client)
    orc = novo_orcamento(client, cli)
    data = client.get("/api/bootstrap").get_json()
    assert any(o["id"] == orc["id"] for o in data["orcamentos"])


# ===========================================================================
# Documentos (PDFs salvos no histórico)
# ===========================================================================

PDF_MINIMO = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
)
import base64 as _b64


def anexar_documento(client, entidade, entidade_id, nome="OS-X.pdf"):
    plural = "ordens" if entidade == "ordem" else "orcamentos"
    res = client.post("/api/" + plural + "/" + entidade_id + "/documentos", json={
        "nome": nome, "base64": _b64.b64encode(PDF_MINIMO).decode(),
    })
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def test_documento_flow_ordem(client):
    login_admin(client)
    cli = novo_cliente(client)
    ordem = nova_ordem(client, cli)

    doc = anexar_documento(client, "ordem", ordem["id"], "OS-" + ordem["numero"] + ".pdf")
    # aparece nos metadados da OS (histórico)
    body = client.get("/api/ordens/" + ordem["id"]).get_json()
    assert len(body["documentos"]) == 1
    assert body["documentos"][0]["nome"] == "OS-" + ordem["numero"] + ".pdf"
    assert body["documentos"][0]["tamanho"] > 0
    assert body["documentos"][0]["id"] == doc["id"]

    # download devolve o PDF
    resp = client.get("/api/documentos/" + doc["id"])
    assert resp.status_code == 200
    assert resp.data[:4] == b"%PDF"
    assert "application/pdf" in resp.content_type
    assert "attachment" in resp.headers.get("Content-Disposition", "")

    # excluir (admin)
    assert client.delete("/api/documentos/" + doc["id"]).status_code == 200
    assert client.get("/api/ordens/" + ordem["id"]).get_json()["documentos"] == []


def test_documento_orcamento_e_metadados_no_bootstrap(client):
    login_admin(client)
    cli = novo_cliente(client)
    orc = novo_orcamento(client, cli)
    anexar_documento(client, "orcamento", orc["id"], "Orcamento-" + orc["numero"] + ".pdf")
    data = client.get("/api/bootstrap").get_json()
    orc_ret = next(o for o in data["orcamentos"] if o["id"] == orc["id"])
    assert len(orc_ret["documentos"]) == 1
    assert orc_ret["documentos"][0]["nome"].startswith("Orcamento-")


def test_documento_invalido(client):
    login_admin(client)
    cli = novo_cliente(client)
    ordem = nova_ordem(client, cli)
    # conteúdo que não é PDF
    res = client.post("/api/ordens/" + ordem["id"] + "/documentos", json={
        "nome": "falso.pdf", "base64": _b64.b64encode(b"<!DOCTYPE html>").decode(),
    })
    assert res.status_code == 400
    assert "PDF" in res.get_json()["erro"]
    # sem conteúdo
    assert client.post("/api/ordens/" + ordem["id"] + "/documentos", json={"nome": "x.pdf"}).status_code == 400
    # registro inexistente
    assert client.post("/api/ordens/naoexiste/documentos", json={
        "nome": "x.pdf", "base64": _b64.b64encode(PDF_MINIMO).decode(),
    }).status_code == 404


def test_tecnico_pode_salvar_mas_nao_excluir_documento(client):
    login_admin(client)
    cli = novo_cliente(client)
    ordem = nova_ordem(client, cli)
    criar_tecnico(client)
    login(client, "tecnico", "tec123")

    doc = anexar_documento(client, "ordem", ordem["id"], "OS-tec.pdf")
    assert doc["id"]
    # técnico não pode excluir (admin)
    assert client.delete("/api/documentos/" + doc["id"]).status_code == 403


# ===========================================================================
# Modelo de impressão do orçamento
# ===========================================================================

def test_orc_modelo_flow(client):
    login_admin(client)
    # padrão: todos os campos visíveis
    data = client.get("/api/bootstrap").get_json()
    assert data["orcModelo"]["obsPadrao"] == ""
    assert "descricao" in data["orcModelo"]["campos"]

    # salvar modelo personalizado
    res = client.put("/api/config/orc-modelo", json={
        "obsPadrao": "Peças com garantia de 90 dias.",
        "rodape": "Orçamento válido apenas na data indicada.",
        "campos": ["cliente_contato", "marca", "descricao"],
    })
    assert res.status_code == 200
    m = res.get_json()
    assert m["obsPadrao"] == "Peças com garantia de 90 dias."
    assert m["rodape"] == "Orçamento válido apenas na data indicada."
    assert m["campos"] == ["cliente_contato", "marca", "descricao"]

    # refletido no bootstrap (usado no formulário e na impressão)
    data = client.get("/api/bootstrap").get_json()
    assert data["orcModelo"]["campos"] == ["cliente_contato", "marca", "descricao"]


def test_orc_modelo_admin_only(client):
    criar_tecnico(client)
    login(client, "tecnico", "tec123")
    res = client.put("/api/config/orc-modelo", json={"obsPadrao": "x", "campos": []})
    assert res.status_code == 403


# ===========================================================================
# CSRF e rate limiting
# ===========================================================================

def test_csrf_bloqueia_post_sem_token(app, client):
    # fora do modo TESTING a proteção CSRF é exigida (double-submit)
    app.config["TESTING"] = False
    login_admin(client)

    # POST sem o header X-CSRF-Token -> 403
    res = client.post("/api/clientes", json={"nome": "Sem Token"})
    assert res.status_code == 403
    assert "CSRF" in res.get_json()["erro"]

    # com o token do cookie -> 201
    cookie = client.get_cookie("techfix_csrf")
    token = cookie.value if hasattr(cookie, "value") else cookie
    assert token
    res = client.post("/api/clientes", json={"nome": "Com Token"}, headers={"X-CSRF-Token": token})
    assert res.status_code == 201


def test_csrf_nao_exige_token_em_modo_teste(client):
    # modo TESTING (suíte legada) não exige token — testes continuam verdes
    login_admin(client)
    res = client.post("/api/clientes", json={"nome": "Modo Teste"})
    assert res.status_code == 201


def test_csrf_token_diferente_do_cookie_e_rejeitado(app, client):
    app.config["TESTING"] = False
    login_admin(client)
    res = client.post(
        "/api/clientes", json={"nome": "Token Errado"},
        headers={"X-CSRF-Token": "token-invalido"},
    )
    assert res.status_code == 403


def test_login_rate_limit(client):
    usuario = "forca.bruta"
    for _ in range(5):
        res = client.post("/api/auth/login", json={"usuario": usuario, "senha": "errada"})
        assert res.status_code == 401
    # sexta tentativa bloqueada com 429
    res = client.post("/api/auth/login", json={"usuario": usuario, "senha": "errada"})
    assert res.status_code == 429
    # login correto de outro usuário continua funcionando (limite por IP+usuário)
    assert login(client, "admin", ADMIN_PASS).status_code == 200


def test_login_sucesso_reseta_contador_de_falhas(client):
    for _ in range(3):
        assert client.post("/api/auth/login", json={"usuario": "admin", "senha": "errada"}).status_code == 401
    # login correto (abaixo do limite) zera as falhas daquele usuário
    assert login(client, "admin", ADMIN_PASS).status_code == 200
    for _ in range(5):
        assert client.post("/api/auth/login", json={"usuario": "admin", "senha": "errada"}).status_code == 401
    assert client.post("/api/auth/login", json={"usuario": "admin", "senha": "errada"}).status_code == 429
