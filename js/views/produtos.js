/* ============================================================
   TechFix OS — Produtos (catálogo)
   Lista, cadastra, edita e exclui os produtos reutilizados na
   Nova OS e nos itens de orçamento.
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui, S = App.store;
  const views = (App.views = App.views || {});
  const actions = (App.actions = App.actions || {});
  const inputs = (App.inputs = App.inputs || {});

  const st = { q: '' };

  function filtered() {
    let l = S.produtos();
    if (st.q) {
      const q = st.q.toLowerCase();
      l = l.filter((p) => (p.nome + ' ' + p.marca).toLowerCase().includes(q));
    }
    return l;
  }

  function criadoPor(p) {
    const t = S.tecnicos().find((x) => x.id === p.criadoPor);
    return t ? t.nome : '—';
  }

  function tableHtml(list) {
    const rows = list.map((p) =>
      '<tr>' +
        '<td><div class="table__cell-main">' + U.esc(p.nome) + '</div>' + (p.marca ? '<div class="table__cell-sub">' + U.esc(p.marca) + '</div>' : '') + '</td>' +
        '<td class="num">' + (p.valor != null ? U.money(p.valor) : '—') + '</td>' +
        '<td class="hide-sm">' + U.esc(criadoPor(p)) + '</td>' +
        '<td><div class="table__actions">' +
          '<button class="icon-btn act" title="Editar produto" data-action="prod:edit" data-id="' + p.id + '">' + U.icon('edit') + '</button>' +
          (App.auth.can('prod:excluir')
            ? '<button class="icon-btn act danger" title="Excluir produto" data-action="prod:del" data-id="' + p.id + '">' + U.icon('trash') + '</button>'
            : '') +
        '</div></td>' +
      '</tr>'
    ).join('');

    return '<div class="card">' +
      '<div class="table-wrap"><table class="table">' +
        '<thead><tr>' +
          '<th>Produto</th><th class="num">Valor</th><th class="hide-sm">Cadastrado por</th><th style="text-align:right">Ações</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
    '</div>';
  }

  function emptyHtml() {
    return '<div class="card"><div class="empty">' +
      '<div class="empty__icon">' + U.icon('bag') + '</div>' +
      '<h3>' + (st.q ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado') + '</h3>' +
      '<p>' + (st.q ? 'Tente outro termo de busca.' : 'Cadastre os produtos para usá-los na Nova OS e nos orçamentos.') + '</p>' +
      '<button class="btn btn--filled" data-action="prod:new">' + U.icon('plus') + ' Novo produto</button>' +
    '</div></div>';
  }

  function refreshList() {
    const wrap = document.getElementById('prodListWrap');
    if (!wrap) return;
    const list = filtered();
    wrap.innerHTML = list.length ? tableHtml(list) : emptyHtml();
    const cnt = document.getElementById('prodCount');
    if (cnt) cnt.textContent = list.length + ' produto' + (list.length === 1 ? '' : 's');
  }

  views.produtos = {
    render() {
      const list = filtered();
      return '' +
        '<div class="page-head">' +
          '<div>' +
            '<h1>Produtos <span class="badge">' + U.icon('bag', 14) + ' ' + S.produtos().length + ' no catálogo</span></h1>' +
            '<p class="page-head__sub">Catálogo usado na Nova OS e nos itens de orçamento — fica salvo para uso futuro.</p>' +
          '</div>' +
          '<div class="page-actions">' +
            '<button class="btn btn--filled" data-action="prod:new">' + U.icon('plus') + ' Novo produto</button>' +
          '</div>' +
        '</div>' +

        '<div class="card filter-bar">' +
          '<div class="filter-bar__search">' + U.icon('search') +
            '<input type="text" placeholder="Buscar produto por nome ou marca…" data-input="prod:search" value="' + U.esc(st.q) + '">' +
          '</div>' +
        '</div>' +

        '<div id="prodCount" style="font-size:.82rem;color:var(--text-3);margin-bottom:12px">' + list.length + ' produto' + (list.length === 1 ? '' : 's') + '</div>' +
        '<div id="prodListWrap">' + (list.length ? tableHtml(list) : emptyHtml()) + '</div>' +

        '<button class="fab" data-action="prod:new" title="Novo produto">' + U.icon('plus', 26) + '</button>';
    },
    mount() { App.onClientCreated = null; }
  };

  inputs['prod:search'] = function (el) {
    st.q = el.value;
    refreshList();
  };

  actions['prod:new'] = function () {
    App.productDialog(null).then((p) => {
      if (p) App.reload();
    });
  };
  actions['prod:edit'] = function (d) {
    if (!App.auth.can('prod:editar')) { U.snackbar('Acesso restrito.', 'error'); return; }
    const p = S.getProduto(d.id);
    if (!p) return;
    App.productDialog(p).then((updated) => {
      if (updated) App.reload();
    });
  };
  actions['prod:del'] = function (d) {
    if (!App.auth.can('prod:excluir')) { U.snackbar('Apenas administradores podem excluir produtos.', 'error'); return; }
    const p = S.getProduto(d.id);
    if (!p) return;
    U.confirm({
      title: 'Excluir ' + p.nome,
      message: 'O produto será removido do catálogo. Ordens e orçamentos já criados não são afetados (guardam cópia do nome).',
      confirmLabel: 'Excluir produto',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.removeProduto(p.id)
        .then(() => {
          U.snackbar('Produto "' + p.nome + '" excluído.', 'info');
          App.reload();
        })
        .catch((err) => U.erro(err, 'Erro ao excluir produto:'));
    });
  };
})(window);
