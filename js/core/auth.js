/* ============================================================
   TechFix OS — Autenticação e perfis
   A sessão agora vive em cookie HttpOnly no servidor (bcrypt).
   O cliente mantém um espelho de permissões apenas para a UI;
   o servidor é a autoridade real.
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App;
  const api = App.api;

  const ROLES = {
    admin:   { label: 'Administrador', color: '#ff8c00' },
    tecnico: { label: 'Técnico',       color: '#5aa7ff' }
  };

  const PERMS = {
    admin: ['*'],
    tecnico: [
      'os:ver', 'os:criar', 'os:avancar', 'os:finalizar', 'os:imprimir',
      'cli:ver', 'cli:criar', 'cli:editar',
      'rep:ver', 'rep:imprimir',
      'orc:ver', 'orc:criar', 'orc:editar', 'orc:avancar', 'orc:imprimir',
      'prod:ver', 'prod:criar', 'prod:editar'
    ]
  };

  let me = null;
  let usersCache = [];

  const Auth = {
    ROLES,

    /* ---------- sessão ---------- */
    async init() {
      try { me = await api('/api/auth/me'); } catch (e) { me = null; }
      return me;
    },
    async login(usuario, senha) {
      try {
        me = await api('/api/auth/login', { method: 'POST', body: { usuario, senha } });
        return { ok: true, user: me };
      } catch (e) {
        return { ok: false, msg: e.msg || 'Usuário ou senha inválidos.' };
      }
    },
    async logout() {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* sessão já inválida */ }
      me = null;
      usersCache = [];
    },
    current() { return me; },
    isAuthed() { return !!(me && me.ativo); },
    can(perm) {
      if (!me || !me.ativo) return false;
      const p = PERMS[me.role] || [];
      return p.indexOf('*') !== -1 || p.indexOf(perm) !== -1;
    },

    /* ---------- gestão de usuários (admin) ---------- */
    users() { return usersCache.slice(); },
    getUser(id) { return usersCache.find((u) => u.id === id) || null; },
    async hydrateUsers() {
      usersCache = await api('/api/usuarios');
      return usersCache;
    },
    async addUser(d) {
      try {
        const u = await api('/api/usuarios', { method: 'POST', body: d });
        await this.hydrateUsers();
        return { ok: true, user: u };
      } catch (e) {
        return { ok: false, msg: e.msg };
      }
    },
    async updateUser(id, d) {
      try {
        const u = await api('/api/usuarios/' + encodeURIComponent(id), { method: 'PATCH', body: d });
        await this.hydrateUsers();
        if (me && me.id === id) me = Object.assign({}, me, u);
        return { ok: true, user: u };
      } catch (e) {
        return { ok: false, msg: e.msg };
      }
    },
    async setPassword(id, nova) {
      try {
        await api('/api/usuarios/' + encodeURIComponent(id) + '/senha', { method: 'POST', body: { nova } });
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: e.msg };
      }
    },
    async changePassword(id, atual, nova) {
      try {
        await api('/api/me/senha', { method: 'POST', body: { atual, nova } });
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: e.msg };
      }
    },
    async removeUser(id) {
      try {
        await api('/api/usuarios/' + encodeURIComponent(id), { method: 'DELETE' });
        await this.hydrateUsers();
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: e.msg };
      }
    }
  };

  App.auth = Auth;
})(window);
