/* ============================================================
   TechFix OS — Clientes (CRUD)
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui, S = App.store;
  const views = (App.views = App.views || {});
  const actions = (App.actions = App.actions || {});
  const inputs = (App.inputs = App.inputs || {});

  const st = { q: '' };

  function filtered() {
    let l = S.clientes();
    if (st.q) {
      const q = st.q.toLowerCase();
      l = l.filter((c) => (c.nome + ' ' + c.telefone + ' ' + c.email + ' ' + c.endereco).toLowerCase().includes(q));
    }
    return l;
  }

  function cliCardHtml(c) {
    const ordens = S.ordensDeCliente(c.id);
    const total = ordens.reduce((s, o) => s + (o.valorFinal != null ? o.valorFinal : (o.status === 'concluida' ? o.valorEstimado : 0)), 0);
    return '<div class="card cli-card">' +
      '<div class="cli-card__head">' +
        U.avatar(c.nome) +
        '<div style="flex:1;min-width:0">' +
          '<div class="cli-card__name">' + U.esc(c.nome) + '</div>' +
          '<div class="cli-card__id">ID ' + c.id + ' · desde ' + U.date(c.criadoEm) + '</div>' +
        '</div>' +
        '<div class="cli-card__actions">' +
          '<button class="icon-btn" data-action="cli:edit" data-id="' + c.id + '" title="Editar">' + U.icon('edit') + '</button>' +
          (App.auth.can('cli:excluir')
            ? '<button class="icon-btn danger" data-action="cli:del" data-id="' + c.id + '" title="Excluir">' + U.icon('trash') + '</button>'
            : '') +
        '</div>' +
      '</div>' +
      '<div class="cli-card__contact">' +
        (c.telefone ? '<div class="info-row">' + U.icon('phone', 15) + '<span>' + U.esc(c.telefone) + '</span></div>' : '') +
        (c.email ? '<div class="info-row">' + U.icon('mail', 15) + '<span>' + U.esc(c.email) + '</span></div>' : '') +
        (c.endereco ? '<div class="info-row">' + U.icon('pin', 15) + '<span>' + U.esc(c.endereco) + '</span></div>' : '') +
      '</div>' +
      '<div class="cli-card__stats">' +
        '<span><b>' + ordens.length + '</b> ordem(ns)</span>' +
        '<span>Total <b>' + U.money(total) + '</b></span>' +
      '</div>' +
    '</div>';
  }

  function refreshGrid() {
    const wrap = document.getElementById('cliGridWrap');
    if (!wrap) return;
    const list = filtered();
    wrap.innerHTML = list.length
      ? '<div class="grid grid--clients">' + list.map(cliCardHtml).join('') + '</div>'
      : '<div class="card"><div class="empty"><div class="empty__icon">' + U.icon('clients') + '</div><h3>' + (st.q ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado') + '</h3><p>' + (st.q ? 'Tente outro termo de busca.' : 'Cadastre o primeiro cliente para vinculá-lo às ordens de serviço.') + '</p><button class="btn btn--filled" data-action="cli:new">' + U.icon('plus') + ' Novo cliente</button></div></div>';
    const cnt = document.getElementById('cliCount');
    if (cnt) cnt.textContent = list.length + ' cliente' + (list.length === 1 ? '' : 's');
  }

  views.clientes = {
    render() {
      const list = filtered();
      return '' +
        '<div class="page-head">' +
          '<div>' +
            '<h1>Clientes <span class="badge">' + U.icon('clients', 14) + ' ' + S.clientes().length + ' cadastrado(s)</span></h1>' +
            '<p class="page-head__sub">Cadastre e mantenha os dados dos seus clientes.</p>' +
          '</div>' +
          '<div class="page-actions">' +
            '<button class="btn btn--filled" data-action="cli:new">' + U.icon('plus') + ' Novo cliente</button>' +
          '</div>' +
        '</div>' +

        '<div class="card filter-bar">' +
          '<div class="filter-bar__search">' + U.icon('search') +
            '<input type="text" placeholder="Buscar cliente por nome, telefone ou e-mail…" data-input="cli:search" value="' + U.esc(st.q) + '">' +
          '</div>' +
        '</div>' +

        '<div id="cliCount" style="font-size:.82rem;color:var(--text-3);margin-bottom:12px">' + list.length + ' cliente' + (list.length === 1 ? '' : 's') + '</div>' +
        '<div id="cliGridWrap">' + (list.length ? '<div class="grid grid--clients">' + list.map(cliCardHtml).join('') + '</div>' : '') + '</div>';
    },
    mount() { /* delegação */ }
  };

  inputs['cli:search'] = function (el) {
    st.q = el.value;
    refreshGrid();
  };

  /* ---------- Dialog de cliente (compartilhado com Nova OS) ---------- */

  App.clientDialog = function (c) {
    const editing = !!c;
    return U.dialog({
      title: editing ? 'Editar cliente' : 'Novo cliente',
      icon: 'clients',
      size: 'lg',
      body:
        '<div class="field"><label>Nome *</label>' +
        '<input id="cliNome" value="' + U.esc(c ? c.nome : '') + '" placeholder="Nome completo ou razão social">' +
        '<div class="field__err">Informe o nome do cliente.</div></div>' +
        '<div class="grid grid--2-1" style="margin-top:16px">' +
          '<div class="field"><label>Telefone</label><input id="cliTel" value="' + U.esc(c ? c.telefone : '') + '" placeholder="(11) 99999-9999"></div>' +
          '<div class="field"><label>E-mail</label><input id="cliMail" value="' + U.esc(c ? c.email : '') + '" placeholder="email@exemplo.com"></div>' +
        '</div>' +
        '<div class="field" style="margin-top:16px"><label>Endereço</label><input id="cliEnd" value="' + U.esc(c ? c.endereco : '') + '" placeholder="Rua, número · Cidade/UF"></div>',
      actions: [
        { id: 'save', label: editing ? 'Salvar alterações' : 'Cadastrar cliente', kind: 'filled', icon: 'check' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'save') return;
        const nome = document.getElementById('cliNome').value.trim();
        if (!nome) {
          document.getElementById('cliNome').closest('.field').classList.add('field--error');
          return false;
        }
        const dados = {
          nome,
          telefone: document.getElementById('cliTel').value.trim(),
          email: document.getElementById('cliMail').value.trim(),
          endereco: document.getElementById('cliEnd').value.trim()
        };
        const op = editing ? S.updateCliente(c.id, dados) : S.addCliente(dados);
        return op
          .then(() => {
            U.snackbar(editing ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.', 'success');
            done();
          })
          .catch((err) => U.erro(err, 'Erro ao salvar cliente:'));
      }
    });
  };

  actions['cli:new'] = function () {
    App.clientDialog(null).then((id) => {
      if (id !== 'save') return;
      if (typeof App.onClientCreated === 'function') App.onClientCreated();
      else App.reload();
    });
  };

  // mantém o hook limpo quando esta view está ativa
  views.clientes.mount = function () {
    App.onClientCreated = null;
  };
  actions['cli:edit'] = function (d) {
    const c = S.getCliente(d.id);
    if (!c) return;
    App.clientDialog(c).then((id) => { if (id === 'save') App.reload(); });
  };
  actions['cli:del'] = function (d) {
    if (!App.auth.can('cli:excluir')) { U.snackbar('Apenas administradores podem excluir clientes.', 'error'); return; }
    const c = S.getCliente(d.id);
    if (!c) return;
    U.confirm({
      title: 'Excluir ' + c.nome,
      message: 'O cliente será removido do cadastro. Se possuir ordens de serviço, a exclusão será bloqueada.',
      confirmLabel: 'Excluir cliente',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.removeCliente(c.id)
        .then((res) => {
          if (!res.ok) { U.snackbar(res.msg, 'error'); return; }
          U.snackbar('Cliente excluído.', 'info');
          App.reload();
        })
        .catch((err) => U.erro(err, 'Erro ao excluir cliente:'));
    });
  };
})(window);
