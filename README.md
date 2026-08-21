# TechFix OS — Sistema de Gestão de Ordens de Serviço

Sistema completo para abrir, acompanhar, finalizar, gerar e imprimir relatórios de
ordens de serviço. Frontend SPA em HTML/CSS/JS puro (dark theme com destaque
laranja `#FF8C00`), com autenticação por perfis (**administrador** e **técnico**)
e banco de dados **SQLite** (dev) ou **PostgreSQL via Supabase** (produção).

## Badges

| Badge | URL (substitua pelo seu repositório) |
|---|---|
| CI · GitHub Actions | `https://github.com/SEU-USUARIO/techfix-os/actions/workflows/ci.yml/badge.svg` |

```markdown
[![CI](https://github.com/SEU-USUARIO/techfix-os/actions/workflows/ci.yml/badge.svg)](https://github.com/SEU-USUARIO/techfix-os/actions/workflows/ci.yml)
```

> **Importante:** troque `SEU-USUARIO/techfix-os` pela URL real do repositório
> depois do primeiro `git push` (o badge só mostra status quando o workflow
> `CI` já rodou ao menos uma vez).

## Funcionalidades

- 📋 **Ordens de serviço**: abrir, acompanhar timeline, transições de status
  (aberta → em andamento → aguardando peça → concluída/cancelada), anotações e
  finalização com valor.
- 🧾 **Orçamentos**: gerar orçamentos com itens, **validade definida
  manualmente** pelo técnico, aprovar/recusar, **conversão automática em OS ao
  aprovar** (opcional, com um clique) e **imprimir** em layout próprio.
- 📄 **Exportar PDF**: orçamentos, OS e relatórios podem ser baixados como PDF
  (jsPDF + html2canvas embutidos em `js/vendor/`) sem depender da janela de
  impressão do navegador. Os PDFs de OS e orçamentos são **salvos no histórico
  do próprio registro** para reimpressão/baixar de novo quando precisar.
- 🎨 **Modelo de orçamento**: o administrador personaliza a impressão
  (campos exibidos, observações padrão para novos orçamentos e texto do
  rodapé) em **Orçamentos → Modelo**.
- 📦 **Produtos (catálogo)**: tela própria no menu para listar, buscar,
  cadastrar, editar e excluir (admin) itens do catálogo; o campo **Produto** da
  Nova OS e dos orçamentos usa esse mesmo catálogo compartilhado.
- 👥 **Clientes**: cadastro completo com busca e exclusão protegida.
- 🧑‍🔧 **Usuários e perfis**: administrador (tudo) e técnico (operação do dia a
  dia), com permissões validadas **no servidor**.
- 🖨️ **Relatórios**: geração e impressão (OS, clientes, financeiro), com
  cabeçalho personalizado da empresa.
- 🖼️ **Logotipo**: upload pela tela **Relatórios → Dados da empresa** (com
  redimensionamento automático); a imagem é armazenada **no banco** (data URL)
  e servida em `/api/empresa/logo` com cache por ETag. Aparece na sidebar, no
  login e nos relatórios.
- 🔐 **Autenticação**: senhas com **bcrypt**, sessões seguras em cookie
  `HttpOnly` + `SameSite=Lax`.
- 🐳 **Docker + PostgreSQL** prontos via `docker-compose`.
- ✅ **CI**: testes automatizados (SQLite + Postgres real) e build da imagem.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript puro (sem build) |
| Backend | Python 3.13, Flask |
| Banco | SQLite (dev) ou **Supabase/PostgreSQL** (produção) |
| Segurança | bcrypt, sessões server-side, cookies `HttpOnly`, CSRF, rate limiting |
| Testes | pytest (50 testes) |
| CI/CD | GitHub Actions |
| Deploy | Netlify (frontend) + Supabase (backend + banco) |

## Requisitos

- **Python 3.13+** (desenvolvido/testado em 3.13)
- **Docker** (apenas para o modo `docker-compose` com Postgres)

## Início rápido (SQLite local)

```bash
# 1. criar o ambiente virtual e instalar dependências
python -m venv .venv

# Linux/macOS
.venv/bin/python -m pip install -r requirements-dev.txt
# Windows
.venv/Scripts/python -m pip install -r requirements-dev.txt

# 2. iniciar o servidor (cria data/techfix.db com o usuário admin no 1º boot)
PORT=8432 .venv/Scripts/python -m server.app
```

> **Nota Windows**: use `.venv/Scripts/python` (o `.venv/bin/python` é do
> Linux/macOS). O servidor deve ser iniciado como módulo (`-m server.app`).

Abra <http://127.0.0.1:8432>.

### Conta padrão

O sistema nasce com uma única conta de administrador (senha padrão `123456`,
alterável no menu do usuário → **Alterar minha senha**):

| Usuário | Senha |
|---|---|
| `admin` | `123456` |

## Deploy: Netlify (frontend) + Supabase (backend + banco)

O **Netlify** publica o frontend estático (`index.html`/`css`/`js`). O **Supabase**
fornece o backend (PostgreSQL gerenciado + API REST via PostgREST).

> **Por que Supabase?** Banco permanente (grátis), dashboard com SQL editor,
> backup automático e API REST via PostgREST.

### Configurar o Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto gratuito.
2. Vá em **Settings → Database → Connection string → URI**.
3. Copie a URL (formato: `postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require`).
4. No **Netlify**, configure as variáveis de ambiente (veja [Variáveis de ambiente](#variáveis-de-ambiente)).
5. O schema, usuário admin e dados da empresa são criados automaticamente no
  primeiro boot da aplicação.

### Migrar dados existentes

Se você já tem dados em outro banco (SQLite local, por exemplo):

```bash
# Configure as variáveis de ambiente
export DATABASE_URL=<URL do banco atual>
export SUPABASE_URL=<URL do Supabase>

# Execute a migração
python scripts/migrate_to_supabase.py
```

O script exporta todos os dados, cria o schema no Supabase e valida a migração.

### Deploy

1. Suba o repositório para o GitHub.
2. **Netlify**: importe o repo (Add new site → Import an existing project).
3. Configure as variáveis de ambiente no Netlify (veja abaixo).
4. **Deploy** — o Netlify publica o frontend e o Supabase roda o backend + banco.

## Variáveis de ambiente

### Netlify (frontend)

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase (ex: `https://xxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Chave anônima do Supabase (Settings → API) |

### Supabase (backend)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | URI de conexão do PostgreSQL (Settings → Database) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (para operações admin) |

### Local (desenvolvimento)

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | `sqlite:///data/techfix.db` | URI do Supabase ou SQLite |
| `TECHFIX_DB` | — | Path SQLite legado (usado se `DATABASE_URL` vazio) |
| `PORT` | `8432` | Porta HTTP |
| `HOST` | `127.0.0.1` | Interface de escuta (`0.0.0.0` na imagem Docker) |
| `BCRYPT_ROUNDS` | (default do bcrypt) | Custo do hash — use `4` em testes para acelerar |

Exemplo completo em [`.env.example`](.env.example).

## Testes

```bash
# SQLite (padrão, banco temporário isolado — não toca em data/techfix.db)
.venv/Scripts/python -m pytest -q
```

Os testes também rodam **contra um Postgres real** (como na CI) — veja a
seção [CI](#ci-github-actions).

50 testes cobrem: autenticação/sessão, permissões por perfil (técnico recebe
403), CSRF (double-submit) e rate limiting do login, CRUD de
clientes/ordens/usuários/produtos/orçamentos (com validade e itens),
documentos PDF salvos no histórico e modelo de impressão do orçamento, além
proteções de admin (não exclui a si mesmo, não rebaixa o último admin).

### Contra um Postgres real

```bash
DATABASE_URL=postgresql://techfix:techfix@localhost:5432/techfix_test \
TECHFIX_TEST_PG=1 BCRYPT_ROUNDS=4 .venv/Scripts/python -m pytest -q
```

A flag `TECHFIX_TEST_PG=1` é uma trava de segurança: sem ela, um `DATABASE_URL`
local acidental nunca apaga um banco de verdade. O conftest recria o schema do
zero a cada teste.

## CI (GitHub Actions)

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em todo
`push`/PR com 3 jobs:

1. **pytest · SQLite** — suíte completa em banco temporário;
2. **pytest · PostgreSQL 16** — mesmos testes contra um Postgres real provisionado
   como service do GitHub Actions (com healthcheck `pg_isready`);
3. **Docker image build** — build da imagem + smoke test (o container sobe,
   cria o schema e o usuário admin, e responde 200 na UI e 401 na API).

## Estrutura do projeto

```
.
├── server/              # Backend Flask (app, auth, db com adapter SQLite/Postgres)
├── js/                  # Frontend SPA (core + views)
│   ├── core/            # store (cliente da API), auth, ui
│   └── views/           # dashboard, ordens, orcamentos, clientes, relatorios, usuarios, login
├── css/                 # Design system (dark theme #FF8C00)
├── tests/               # pytest: test_api.py + test_db.py
├── data/                # SQLite local (techfix.db, criado no 1º boot)
├── conftest.py          # Fixtures (SQLite temporário / Postgres via env)
├── Dockerfile           # Imagem do app (backend + UI)
├── docker-compose.yml   # App + PostgreSQL 16 com healthcheck
├── .github/workflows/   # CI
└── requirements*.txt    # Dependências
```

## Segurança

- Senhas armazenadas com **bcrypt** (nunca em texto puro ou hash fraco).
- Sessões: token aleatório de 32 bytes em cookie `HttpOnly` + `SameSite=Lax`,
  com expiração de 7 dias; no banco fica apenas o SHA-256 do token.
- Permissões validadas **no servidor** (o frontend só oculta botões).
- SQL 100% parametrizado.

> O sistema já conta com CSRF (double-submit via cookie + header), rate
> limiting no login e cookie `Secure` sob HTTPS. Em um crescimento futuro:
> bloqueio persistente de IP, captcha ou 2FA no login.

## Licença

Projeto de demonstração — sem licença definida.
