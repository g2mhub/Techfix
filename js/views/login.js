/* ============================================================
   TechFix OS — Tela de Login
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui;
  const views = (App.views = App.views || {});
  const actions = (App.actions = App.actions || {});

  function errorEl(msg) {
    return '<div class="auth__error' + (msg ? ' show' : '') + '">' +
      U.icon('warning') + '<span>' + U.esc(msg || '') + '</span></div>';
  }

  views.login = {
    render() {
      return '' +
        '<div class="auth-wrap">' +
          '<div class="auth-card">' +
            '<div class="auth-card__brand">' +
              '<div class="brand-logo" id="authBrandLogo">' + U.icon('wrench', 24) + '</div>' +
              '<div class="brand-text"><strong>TechFix</strong><span>Ordens de Serviço</span></div>' +
            '</div>' +
            '<h1 class="auth-card__title">Acesso ao sistema</h1>' +
            '<p class="auth-card__sub">Entre com suas credenciais para continuar.</p>' +

            '<form id="loginForm" novalidate>' +
              '<div class="field">' +
                '<label>Usuário</label>' +
                '<div class="auth-input">' + U.icon('user', 18) +
                  '<input id="authUser" type="text" placeholder="seu.usuario" autocomplete="username" autofocus>' +
                '</div>' +
              '</div>' +
              '<div class="field" style="margin-top:16px">' +
                '<label>Senha</label>' +
                '<div class="auth-input">' + U.icon('lock', 18) +
                  '<input id="authPass" type="password" placeholder="••••••••" autocomplete="current-password">' +
                  '<button type="button" class="auth-eye" data-action="auth:eye" title="Mostrar/ocultar senha">' + U.icon('eye', 17) + '</button>' +
                '</div>' +
              '</div>' +
              '<div id="authError" style="margin-top:16px">' + errorEl() + '</div>' +
              '<button type="submit" class="btn btn--filled btn--lg auth-submit">' + U.icon('send') + ' Entrar</button>' +
            '</form>' +
          '</div>' +
          '<p class="auth-foot">Acesso restrito · Sessão segura (bcrypt + cookie HttpOnly)</p>' +
        '</div>';
    },
    mount() {
      const form = document.getElementById('loginForm');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        doLogin();
      });
      // Logo da empresa (público): troca o ícone pela logo se houver
      const probe = new Image();
      probe.onload = () => {
        if (probe.naturalWidth > 0) {
          const el = document.getElementById('authBrandLogo');
          if (el) {
            el.innerHTML = '<img src="/api/empresa/logo" alt="Logotipo">';
            el.classList.add('brand-logo--img');
          }
        }
      };
      probe.src = '/api/empresa/logo';
      // Enter nos campos aciona o submit nativo do form
    }
  };

  function setError(msg) {
    const box = document.getElementById('authError');
    if (!box) return;
    box.innerHTML = errorEl(msg);
    const card = document.querySelector('.auth-card');
    if (msg && card) {
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
  }

  async function doLogin() {
    const user = document.getElementById('authUser').value.trim();
    const pass = document.getElementById('authPass').value;
    if (!user || !pass) { setError('Informe usuário e senha.'); return; }
    const btn = document.querySelector('.auth-submit');
    if (btn) btn.disabled = true;
    const res = await App.auth.login(user, pass);
    if (btn) btn.disabled = false;
    if (!res.ok) { setError(res.msg); return; }
    try { await App.store.hydrate(); } catch (e) { /* dados virão no próximo load */ }
    U.snackbar('Bem-vindo, ' + res.user.nome + '!', 'success');
    const dest = App.pendingRoute || 'dashboard';
    App.pendingRoute = null;
    App.go(dest);
  }

  actions['auth:eye'] = function (d, e) {
    const btn = e.target.closest('.auth-eye');
    const wrap = btn ? btn.closest('.auth-input') : null;
    if (!wrap) return;
    const input = wrap.querySelector('input');
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.innerHTML = U.icon(isPass ? 'eye-off' : 'eye', 17);
    input.focus();
  };
})(window);
