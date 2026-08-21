/* ============================================================
   TechFix OS — Usuários (gestão de contas e perfis)
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui;
  const views = (App.views = App.views || {});
  const actions = (App.actions = App.actions || {});

  function roleChip(role) {
    const r = App.auth.ROLES[role];
    return '<span class="chip chip--status" style="--c:' + r.color + '">' +
      U.icon(role === 'admin' ? 'shield' : 'user', 12) + ' ' + r.label + '</span>';
  }

  function userRowHtml(u, meId) {
    const isMe = u.id === meId;
    return '<div class="user-row">' +
      U.avatar(u.nome) +
      '<div class="user-row__body">' +
        '<div class="user-row__name">' + U.esc(u.nome) + (isMe ? ' <span class="user-row__me">você</span>' : '') + '</div>' +
        '<div class="user-row__sub">@' + U.esc(u.usuario) + ' · desde ' + U.date(u.criadoEm) + '</div>' +
      '</div>' +
      '<div class="user-row__chips">' +
        roleChip(u.role) +
        (u.ativo
          ? '<span class="chip chip--status" style="--c:#57c98a">' + U.icon('check', 12) + ' Ativo</span>'
          : '<span class="chip chip--status" style="--c:#8b8b96">Inativo</span>') +
      '</div>' +
      '<div class="user-row__actions">' +
        '<button class="icon-btn" title="Editar" data-action="usu:edit" data-id="' + u.id + '">' + U.icon('edit') + '</button>' +
        '<button class="icon-btn" title="Redefinir senha" data-action="usu:pass" data-id="' + u.id + '">' + U.icon('key') + '</button>' +
        '<button class="icon-btn danger" title="Excluir" data-action="usu:del" data-id="' + u.id + '"' + (isMe ? ' disabled' : '') + '>' + U.icon('trash') + '</button>' +
      '</div>' +
    '</div>';
  }

  function sectionHtml(title, icon, sub, list, meId) {
    return '<div class="card card--pad">' +
      '<div class="card__title">' + U.icon(icon) + ' ' + title +
        '<span style="margin-left:auto;font-size:.8rem;color:var(--text-3)">' + list.length + ' conta(s)</span>' +
      '</div>' +
      '<div class="card__sub">' + sub + '</div>' +
      '<div class="user-list">' + (list.length ? list.map((u) => userRowHtml(u, meId)).join('') : '<p class="muted" style="padding:12px 2px">Nenhum usuário neste perfil.</p>') + '</div>' +
    '</div>';
  }

  views.usuarios = {
    async load() {
      await App.auth.hydrateUsers();
    },
    render() {
      const me = App.auth.current();
      const meId = me ? me.id : '';
      const all = App.auth.users().slice().sort((a, b) => a.nome.localeCompare(b.nome));
      const admins = all.filter((u) => u.role === 'admin');
      const tecs = all.filter((u) => u.role === 'tecnico');

      return '' +
        '<div class="page-head">' +
          '<div>' +
            '<h1>Usuários <span class="badge">' + U.icon('shield', 14) + ' ' + all.length + ' no total</span></h1>' +
            '<p class="page-head__sub">Gerencie contas de acesso e perfis de permissão do sistema.</p>' +
          '</div>' +
          '<div class="page-actions">' +
            '<button class="btn btn--filled" data-action="usu:new">' + U.icon('plus') + ' Novo usuário</button>' +
          '</div>' +
        '</div>' +

        sectionHtml('Administradores', 'shield', 'Acesso total: ordens, clientes, relatórios, dados da empresa e gestão de usuários.', admins, meId) +

        '<div style="margin-top:20px">' +
        sectionHtml('Técnicos', 'user', 'Acesso operacional: abrir, acompanhar e finalizar ordens, clientes e relatórios.', tecs, meId) +
        '</div>' +

        '<div class="card card--pad" style="margin-top:20px">' +
          '<div class="card__title">' + U.icon('info') + ' Perfis de permissão</div>' +
          '<div class="perm-grid" style="margin-top:14px">' +
            '<div class="perm-col"><div class="perm-col__title">' + roleChip('admin') + '</div>' +
              '<ul><li>Gerencia usuários e senhas</li><li>Exclui ordens e clientes</li><li>Edita dados da empresa</li></ul></div>' +
            '<div class="perm-col"><div class="perm-col__title">' + roleChip('tecnico') + '</div>' +
              '<ul><li>Abre e acompanha ordens</li><li>Inicia, pausa e finaliza OS</li><li>Cadastra clientes</li><li>Gera e imprime relatórios</li></ul></div>' +
          '</div>' +
        '</div>';
    },
    mount() { App.onClientCreated = null; }
  };

  /* ---------- Dialog: novo usuário ---------- */
  function userDialog(u) {
    const editing = !!u;
    return U.dialog({
      title: editing ? 'Editar usuário' : 'Novo usuário',
      icon: 'user',
      body:
        '<div class="field"><label>Nome completo *</label>' +
        '<input id="usuNome" value="' + U.esc(u ? u.nome : '') + '" placeholder="Nome e sobrenome">' +
        '<div class="field__err">Informe o nome.</div></div>' +
        '<div class="field" style="margin-top:16px"><label>Usuário (login) *</label>' +
        '<input id="usuUser" value="' + U.esc(u ? u.usuario : '') + '" placeholder="ex.: joao.silva" ' + (editing ? 'disabled' : '') + '>' +
        '<div class="field__err">Informe o login (mín. 3 letras/números).</div></div>' +
        (!editing
          ? '<div class="field" style="margin-top:16px"><label>Senha inicial *</label>' +
            '<input id="usuPass" type="password" placeholder="mínimo 4 caracteres">' +
            '<div class="field__err">A senha deve ter ao menos 4 caracteres.</div></div>'
          : '') +
        '<div class="field" style="margin-top:16px"><label>Perfil</label>' +
        '<select id="usuRole">' +
          '<option value="admin"' + (u && u.role === 'admin' ? ' selected' : '') + '>Administrador</option>' +
          '<option value="tecnico"' + (u && u.role === 'tecnico' ? ' selected' : '') + '>Técnico</option>' +
        '</select></div>' +
        (editing
          ? '<label class="switch" style="margin-top:18px"><input type="checkbox" id="usuAtivo"' + (u.ativo ? ' checked' : '') + '><span class="switch__slider"></span><span>Conta ativa</span></label>'
          : ''),
      actions: [
        { id: 'save', label: editing ? 'Salvar alterações' : 'Criar usuário', kind: 'filled', icon: 'check' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'save') return;
        const nome = document.getElementById('usuNome').value.trim();
        if (!nome) { markErr('usuNome'); return false; }
        if (editing) {
          const role = document.getElementById('usuRole').value;
          const ativo = document.getElementById('usuAtivo').checked;
          return App.auth.updateUser(u.id, { nome, role, ativo })
            .then((res) => {
              if (!res.ok) { U.snackbar(res.msg, 'error'); return; }
              U.snackbar('Usuário atualizado.', 'success');
              done();
            })
            .catch((err) => U.erro(err, 'Erro:'));
        }
        const usuario = document.getElementById('usuUser').value.trim().toLowerCase();
        const senha = document.getElementById('usuPass').value;
        if (!/^[a-z0-9._-]{3,}$/.test(usuario)) { markErr('usuUser'); return false; }
        if (senha.length < 4) { markErr('usuPass'); return false; }
        const role = document.getElementById('usuRole').value;
        return App.auth.addUser({ nome, usuario, senha, role })
          .then((res) => {
            if (!res.ok) { U.snackbar(res.msg, 'error'); return; }
            U.snackbar('Usuário criado com sucesso.', 'success');
            done();
          })
          .catch((err) => U.erro(err, 'Erro:'));
      }
    });
  }

  function markErr(id) {
    const el = document.getElementById(id);
    if (el) el.closest('.field').classList.add('field--error');
  }

  actions['usu:new'] = function () {
    userDialog(null).then((id) => { if (id === 'save') App.reload(); });
  };
  actions['usu:edit'] = function (d) {
    const u = App.auth.getUser(d.id);
    if (!u) return;
    userDialog(u).then((id) => { if (id === 'save') App.reload(); });
  };

  /* ---------- Redefinir senha ---------- */
  actions['usu:pass'] = function (d) {
    const u = App.auth.getUser(d.id);
    if (!u) return;
    U.dialog({
      title: 'Redefinir senha',
      icon: 'key',
      body:
        '<div class="field"><label>Nova senha para ' + U.esc(u.nome) + ' *</label>' +
        '<input id="usuPassNew" type="password" placeholder="mínimo 4 caracteres">' +
        '<div class="field__err">A senha deve ter ao menos 4 caracteres.</div></div>' +
        '<div class="field" style="margin-top:16px"><label>Confirmar nova senha</label>' +
        '<input id="usuPassConf" type="password" placeholder="repita a senha">' +
        '<div class="field__err">As senhas não coincidem.</div></div>',
      actions: [
        { id: 'save', label: 'Redefinir senha', kind: 'filled', icon: 'key' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'save') return;
        const nova = document.getElementById('usuPassNew').value;
        const conf = document.getElementById('usuPassConf').value;
        if (nova.length < 4) { markErr('usuPassNew'); return false; }
        if (nova !== conf) { markErr('usuPassConf'); return false; }
        return App.auth.setPassword(u.id, nova)
          .then((res) => {
            if (!res.ok) { U.snackbar(res.msg, 'error'); return; }
            U.snackbar('Senha redefinida para ' + u.nome + '.', 'success');
            done();
          })
          .catch((err) => U.erro(err, 'Erro:'));
      }
    });
  };

  /* ---------- Excluir ---------- */
  actions['usu:del'] = function (d) {
    const u = App.auth.getUser(d.id);
    if (!u) return;
    const me = App.auth.current();
    if (me && me.id === u.id) { U.snackbar('Você não pode excluir o próprio usuário.', 'error'); return; }
    U.confirm({
      title: 'Excluir usuário',
      message: 'A conta de ' + u.nome + ' (@' + u.usuario + ') será removida permanentemente e não poderá mais acessar o sistema.',
      confirmLabel: 'Excluir usuário',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      App.auth.removeUser(u.id)
        .then((res) => {
          if (!res.ok) { U.snackbar(res.msg, 'error'); return; }
          U.snackbar('Usuário excluído.', 'info');
          App.reload();
        })
        .catch((err) => U.erro(err, 'Erro:'));
    });
  };

  /* ---------- Minha conta (topbar) ---------- */
  App.changeMyPassword = function () {
    U.dialog({
      title: 'Alterar minha senha',
      icon: 'key',
      body:
        '<div class="field"><label>Senha atual *</label>' +
        '<input id="myPassCur" type="password" placeholder="senha atual">' +
        '<div class="field__err">Senha atual incorreta.</div></div>' +
        '<div class="field" style="margin-top:16px"><label>Nova senha *</label>' +
        '<input id="myPassNew" type="password" placeholder="mínimo 4 caracteres">' +
        '<div class="field__err">A senha deve ter ao menos 4 caracteres.</div></div>' +
        '<div class="field" style="margin-top:16px"><label>Confirmar nova senha</label>' +
        '<input id="myPassConf" type="password" placeholder="repita a senha">' +
        '<div class="field__err">As senhas não coincidem.</div></div>',
      actions: [
        { id: 'save', label: 'Salvar nova senha', kind: 'filled', icon: 'check' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'save') return;
        const me = App.auth.current();
        if (!me) { done(); return; }
        const cur = document.getElementById('myPassCur').value;
        const nova = document.getElementById('myPassNew').value;
        const conf = document.getElementById('myPassConf').value;
        if (nova.length < 4) { markErr('myPassNew'); return false; }
        if (nova !== conf) { markErr('myPassConf'); return false; }
        return App.auth.changePassword(me.id, cur, nova)
          .then((res) => {
            if (!res.ok) {
              if (res.msg === 'Senha atual incorreta.') markErr('myPassCur');
              else U.snackbar(res.msg, 'error');
              return;
            }
            U.snackbar('Senha alterada com sucesso.', 'success');
            done();
          })
          .catch((err) => U.erro(err, 'Erro:'));
      }
    });
  };
})(window);
