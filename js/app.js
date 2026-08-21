/* ============================================================
   TechFix OS — Aplicação: router, sidebar, navegação, sessão
   (backend Flask/SQLite — sessão por cookie HttpOnly)
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui, S = App.store, A = App.auth;

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'ordens', label: 'Ordens de Serviço', icon: 'orders' },
    { id: 'orcamentos', label: 'Orçamentos', icon: 'receipt' },
    { id: 'produtos', label: 'Produtos', icon: 'bag' },
    { id: 'clientes', label: 'Clientes', icon: 'clients' },
    { id: 'relatorios', label: 'Relatórios', icon: 'reports' }
  ];

  const TITLES = {
    dashboard: 'Dashboard',
    ordens: 'Ordens de Serviço',
    ordem: 'Detalhes da OS',
    nova: 'Nova OS',
    orcamentos: 'Orçamentos',
    orcamento: 'Detalhes do orçamento',
    orcform: 'Novo orçamento',
    produtos: 'Produtos',
    clientes: 'Clientes',
    relatorios: 'Relatórios',
    usuarios: 'Usuários',
    login: 'Entrar'
  };

  /* ---------- Sidebar ---------- */
  function buildSidebar() {
    const nav = document.getElementById('sidebarNav');
    const items = NAV.slice();
    if (A.can('usuarios:gerenciar')) items.push({ id: 'usuarios', label: 'Usuários', icon: 'shield' });
    nav.innerHTML =
      '<div class="nav-group">Menu</div>' +
      items.map((n) =>
        '<button class="nav-item" data-nav="' + n.id + '">' +
          U.icon(n.icon, 20) + '<span>' + n.label + '</span>' +
        '</button>'
      ).join('') +
      '<div class="nav-divider"></div>' +
      '<button class="nav-item nav-item--cta" data-nav="nova">' +
        U.icon('plus', 20) + '<span>Nova OS</span>' +
      '</button>';
  }

  function setActiveNav(route) {
    document.querySelectorAll('.nav-item[data-nav]').forEach((el) => {
      const active = el.dataset.nav === route;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  /* ---------- Router ---------- */
  function notFoundHtml() {
    return '<div class="card"><div class="empty">' +
      '<div class="empty__icon">' + U.icon('info') + '</div>' +
      '<h3>Página não encontrada</h3>' +
      '<p>A rota acessada não existe ou a ordem de serviço não foi informada.</p>' +
      '<button class="btn btn--filled" data-action="nav" data-route="dashboard">Ir para o Dashboard</button>' +
    '</div></div>';
  }

  function deniedHtml() {
    return '<div class="card"><div class="empty">' +
      '<div class="empty__icon">' + U.icon('shield') + '</div>' +
      '<h3>Acesso restrito</h3>' +
      '<p>Seu perfil não possui permissão para acessar esta área. Solicite a um administrador se precisar.</p>' +
      '<button class="btn btn--filled" data-action="nav" data-route="dashboard">Ir para o Dashboard</button>' +
    '</div></div>';
  }

  function go(route) {
    const target = '#/' + route;
    if (location.hash === target) { render(); return; }
    location.hash = target;
  }

  async function render() {
    const hash = location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);
    const route = parts[0] || 'dashboard';
    const param = parts[1];

    // ---- guarda de autenticação ----
    const authed = A.isAuthed();
    document.body.classList.toggle('auth-mode', !authed);
    if (!authed) {
      if (route !== 'login') {
        if (route !== 'dashboard') App.pendingRoute = hash;
        if (location.hash !== '#/login') location.hash = '#/login';
        return;
      }
      const root = document.getElementById('view');
      root.classList.remove('view--in');
      root.innerHTML = App.views.login.render();
      void root.offsetWidth;
      root.classList.add('view--in');
      document.getElementById('topbarCrumb').innerHTML =
        '<span class="crumb-root">Acesso</span>' +
        '<span class="crumb-sep">/</span>' +
        '<span class="crumb-cur">Entrar</span>';
      bind(root);
      App.views.login.mount();
      return;
    }
    if (route === 'login') {
      location.hash = '#/dashboard';
      return;
    }

    let view, title, navKey;
    if (route === 'ordem') {
      if (param && S.getOrdem(param)) {
        view = App.views.ordemDetail;
        title = TITLES.ordem;
        navKey = 'ordens';
      } else {
        view = { render: () => notFoundHtml() };
        title = 'Não encontrada';
        navKey = 'ordens';
      }
    } else if (route === 'orcamento') {
      if (param && S.getOrcamento(param)) {
        view = App.views.orcamentoDetail;
        title = TITLES.orcamento;
        navKey = 'orcamentos';
      } else {
        view = { render: () => notFoundHtml() };
        title = 'Não encontrada';
        navKey = 'orcamentos';
      }
    } else if (route === 'usuarios') {
      if (!A.can('usuarios:gerenciar')) {
        view = { render: () => deniedHtml() };
        title = 'Acesso restrito';
        navKey = 'dashboard';
      } else {
        view = App.views.usuarios;
        title = TITLES.usuarios;
        navKey = 'usuarios';
      }
    } else if (App.views[route]) {
      view = App.views[route];
      if (route === 'orcform') {
        // mesmo formulário serve para novo e edição (param = id do orçamento)
        title = param ? 'Editar orçamento' : TITLES.orcform;
        navKey = 'orcamentos';
      } else {
        title = TITLES[route] || TITLES.dashboard;
        navKey = route;
      }
    } else {
      view = { render: () => notFoundHtml() };
      title = 'Não encontrada';
      navKey = 'dashboard';
    }

    // views que dependem de dados buscados sob demanda (ex.: Usuários)
    if (typeof view.load === 'function') {
      try { await view.load(); } catch (e) { /* mantém o cache atual */ }
      // se o usuário navegou enquanto o load estava pendente, descarta esta renderização
      if (location.hash.replace(/^#\/?/, '') !== hash) return;
    }

    const root = document.getElementById('view');
    root.classList.remove('view--in');
    root.innerHTML = view.render(param);
    void root.offsetWidth;
    root.classList.add('view--in');

    buildSidebar();
    setActiveNav(navKey);
    document.getElementById('topbarCrumb').innerHTML =
      '<span class="crumb-root">Gestão de OS</span>' +
      '<span class="crumb-sep">/</span>' +
      '<span class="crumb-cur">' + title + '</span>';

    bind(root);
    if (typeof view.mount === 'function') view.mount(param);
    renderUser();
    window.scrollTo({ top: 0, behavior: 'instant' });
    closeSidebar();
  }

  /* ---------- Delegação de eventos + ripple ---------- */
  let bound = null;

  function spawnRipple(btn, e) {
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = size + 'px';
    s.style.left = (e.clientX - rect.left - size / 2) + 'px';
    s.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(s);
    setTimeout(() => s.remove(), 620);
  }

  function bind(root) {
    // evita acumular listeners a cada render (o nó #view é reaproveitado)
    if (bound) {
      root.removeEventListener('click', bound.click);
      root.removeEventListener('input', bound.input);
      root.removeEventListener('change', bound.change);
      root.removeEventListener('keydown', bound.keydown);
    }
    const click = (e) => {
      const rippleTarget = e.target.closest('.btn, .icon-btn, .fchip, .nav-item');
      if (rippleTarget) spawnRipple(rippleTarget, e);
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const d = t.dataset;
      const handler = App.actions[d.action];
      if (!handler) return;
      try {
        const r = handler(d, e);
        if (r && typeof r.catch === 'function') {
          r.catch((err) => U.erro(err, 'Erro:'));
        }
      } catch (err) {
        U.erro(err, 'Erro:');
      }
    };
    const input = (e) => {
      const t = e.target.closest('[data-input]');
      if (!t) return;
      const h = App.inputs[t.dataset.input];
      if (h) h(t, t.dataset, e);
    };
    const change = (e) => {
      const t = e.target.closest('[data-change]');
      if (!t) return;
      const h = App.changes[t.dataset.change];
      if (h) h(t, t.dataset, e);
    };
    const keydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest('[data-action], [data-nav]');
      if (!t) return;
      e.preventDefault();
      t.click();
    };
    root.addEventListener('click', click);
    root.addEventListener('input', input);
    root.addEventListener('change', change);
    root.addEventListener('keydown', keydown);
    bound = { click, input, change, keydown };
  }

  /* ---------- Sidebar responsiva ---------- */
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const btnMenu = document.getElementById('btnMenu');
  const btnNewTop = document.getElementById('btnNewTop');

  function closeSidebar() {
    sidebar.classList.remove('open');
    scrim.classList.remove('show');
  }
  App.closeSidebar = closeSidebar;

  btnMenu.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    scrim.classList.toggle('show');
  });
  scrim.addEventListener('click', closeSidebar);
  btnNewTop.addEventListener('click', () => go('nova'));

  /* ---------- Logo da empresa na sidebar ---------- */
  function renderBrand() {
    const el = document.getElementById('brandLogo');
    if (!el) return;
    const emp = S.empresa();
    if (emp && emp.logo) {
      el.innerHTML = '<img src="/api/empresa/logo" alt="Logotipo">';
      el.classList.add('brand-logo--img');
    } else {
      el.innerHTML = U.icon('wrench', 22);
      el.classList.remove('brand-logo--img');
    }
  }
  App.renderBrand = renderBrand;
  renderBrand();

  /* ---------- Topbar: usuário + menu de conta ---------- */
  function renderUser() {
    const u = A.current();
    if (!u) return;
    const avatar = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    const role = document.getElementById('userRole');
    const drop = document.getElementById('userMenuDrop');
    if (avatar) avatar.textContent = U.initials(u.nome);
    if (name) name.textContent = u.nome;
    if (role) role.textContent = A.ROLES[u.role].label;
    renderBrand();
    if (drop) {
      drop.innerHTML =
        '<button class="user-menu__item" data-act="mypass">' + U.icon('key', 16) + '<span>Alterar minha senha</span></button>' +
        '<div class="user-menu__sep"></div>' +
        '<button class="user-menu__item" data-act="logout">' + U.icon('logout', 16) + '<span>Sair da conta</span></button>';
    }
  }

  function doLogout() {
    A.logout().then(() => {
      App.pendingRoute = null;
      document.getElementById('userMenuDrop').classList.remove('open');
      U.snackbar('Sessão encerrada. Até logo!', 'info');
      location.hash = '#/login';
    });
  }

  const btnUserMenu = document.getElementById('btnUserMenu');
  const userMenuDrop = document.getElementById('userMenuDrop');
  btnUserMenu.innerHTML = U.icon('menu', 20);
  btnUserMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    userMenuDrop.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) userMenuDrop.classList.remove('open');
  });
  userMenuDrop.addEventListener('click', (e) => {
    const item = e.target.closest('[data-act]');
    if (!item) return;
    userMenuDrop.classList.remove('open');
    if (item.dataset.act === 'mypass' && typeof App.changeMyPassword === 'function') App.changeMyPassword();
    if (item.dataset.act === 'logout') doLogout();
  });

  /* ---------- Ações genéricas ---------- */
  App.actions = App.actions || {};
  App.actions.nav = function (d) { go(d.route); };
  App.actions['open-ordem'] = function (d) { go('ordem/' + d.id); };
  App.actions['open-orc'] = function (d) { go('orcamento/' + d.id); };

  /* ---------- Bootstrap ---------- */
  App.go = go;
  App.reload = render;
  App.doLogout = doLogout;
  document.getElementById('sidebarNav').addEventListener('click', (e) => {
    const t = e.target.closest('[data-nav]');
    if (!t) return;
    go(t.dataset.nav);
  });
  window.addEventListener('hashchange', render);

  // sessão expirada/inválida durante o uso: volta ao login
  App.handleUnauthorized = () => {
    if (A.isAuthed()) A.logout();
    App.pendingRoute = null;
    if (location.hash !== '#/login') location.hash = '#/login';
  };

  // se algo falhar antes do boot concluir, não deixa o app invisível
  window.addEventListener('error', () => document.body.classList.remove('auth-pending'));

  (async function boot() {
    await A.init();                    // valida a sessão via cookie
    if (A.isAuthed()) {
      try { await S.hydrate(); } catch (e) { /* 401 já tratado pelo handleUnauthorized */ }
    }
    document.body.classList.remove('auth-pending');
    buildSidebar();
    render();
  })();
})(window);
