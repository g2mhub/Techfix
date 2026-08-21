/* ============================================================
   TechFix OS — Orçamentos
   (lista + filtros, formulário com itens e validade, detalhe,
   impressão em layout similar ao de ordens de serviço)
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui, S = App.store;
  const views = (App.views = App.views || {});
  const actions = (App.actions = App.actions || {});
  const inputs = (App.inputs = App.inputs || {});
  const changes = (App.changes = App.changes || {});

  /* ---------- helpers compartilhados ---------- */

  function clienteNome(orc) {
    const c = S.getCliente(orc.clienteId);
    return c ? c.nome : '—';
  }

  function orcChip(st) {
    const m = S.ORC_STATUS[st] || {};
    return '<span class="chip chip--status" style="--c:' + (m.cor || '#8b8b96') + '">' + U.esc(m.label || st) + '</span>';
  }

  function orcValidadePill(orc) {
    if (!orc.validade) return '<span class="muted">Sem validade</span>';
    const vencida = orc.validade < Date.now() && orc.status === 'aberto';
    if (vencida) return '<span class="chip chip--status" style="--c:#ff6b6b">Vencida · ' + U.date(orc.validade) + '</span>';
    return '<span class="muted">Válido até ' + U.date(orc.validade) + '</span>';
  }

  function tecOptions() {
    const me = App.auth.current();
    const nomes = S.tecnicos().map((t) => t.nome);
    if (me && nomes.indexOf(me.nome) === -1) nomes.unshift(me.nome);
    return nomes.map((n) =>
      '<option' + (me && n === me.nome ? ' selected' : '') + '>' + U.esc(n) + '</option>'
    ).join('');
  }

  function prodOptions(selId) {
    const prods = S.produtos();
    let opts = '<option value="">Selecione o produto…</option>';
    if (!prods.length) opts += '<option value="">Nenhum produto cadastrado — clique em + para cadastrar.</option>';
    opts += prods.map((p) =>
      '<option value="' + p.id + '"' + (selId === p.id ? ' selected' : '') + '>' +
        U.esc(p.nome) + (p.marca ? ' (' + U.esc(p.marca) + ')' : '') +
      '</option>'
    ).join('');
    return opts;
  }

  /* ============================================================
     IMPRESSÃO DO ORÇAMENTO
     ============================================================ */

  App.buildOrcReport = function (emp, orc) {
    // modelo personalizável: campos exibidos + rodapé (config do admin)
    const modelo = S.orcModelo() || { obsPadrao: '', rodape: '', campos: [] };
    const campos = modelo.campos || [];
    const has = (k) => campos.indexOf(k) !== -1;
    const cli = S.getCliente(orc.clienteId);
    const rows = (orc.itens || []).map((it) => {
      const marca = has('marca') && it.marca ? '<br><span class="sub">' + U.esc(it.marca) + '</span>' : '';
      return '<tr>' +
        '<td class="num">' + it.qtd + '</td>' +
        '<td><strong>' + U.esc(it.produto) + '</strong>' + marca + '</td>' +
        '<td class="num">' + U.money(it.valor) + '</td>' +
        '<td class="num">' + U.money(it.valor * it.qtd) + '</td>' +
      '</tr>';
    }).join('');
    const cliContato = has('cliente_contato')
      ? ((cli && cli.telefone ? '<div>' + U.esc(cli.telefone) + '</div>' : '') +
         (cli && cli.email ? '<div>' + U.esc(cli.email) + '</div>' : '') +
         (cli && cli.endereco ? '<div>' + U.esc(cli.endereco) + '</div>' : ''))
      : '';
    const footer = (modelo.rodape && modelo.rodape.trim())
      ? '<p class="report__foot">' + U.esc(modelo.rodape) + '</p>'
      : App.reportFoot();
    return '<div class="report">' +
      App.reportHead(emp) +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">' +
        '<div>' +
          '<h2 class="report__title">Orçamento</h2>' +
          '<p class="report__period">Criado em ' + U.dateTime(orc.criadoEm) + ' · Técnico: ' + U.esc(orc.tecnico || '—') + '</p>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div class="report__osnum">' + orc.numero + '</div>' +
          '<span class="report__status">' + U.esc(S.ORC_STATUS[orc.status].label) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="report__grid">' +
        '<div class="report__block"><h4>Cliente</h4>' +
          '<div><strong>' + U.esc(cli ? cli.nome : '—') + '</strong></div>' +
          cliContato +
        '</div>' +
        '<div class="report__block"><h4>Validade</h4>' +
          '<div><strong>' + U.date(orc.validade) + '</strong></div>' +
          '<div class="sub">' + (orc.status === 'aberto' && orc.validade < Date.now() ? 'Este orçamento está vencido.' : 'Prazo de aceite deste orçamento.') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="report__block"><h4>Itens</h4>' +
        '<table>' +
          '<thead><tr><th class="num">Qtd</th><th>Descrição</th><th class="num">Valor unit.</th><th class="num">Subtotal</th></tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="4" style="text-align:center">Sem itens.</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="report__totals">' +
        '<div><span>Total do orçamento</span><b>' + U.money(orc.valorTotal) + '</b></div>' +
        '<div><span>Validade</span><b>' + U.date(orc.validade) + '</b></div>' +
      '</div>' +
      (has('descricao') && orc.descricao ? '<div class="report__block"><h4>Descrição do serviço</h4><div>' + U.esc(orc.descricao) + '</div></div>' : '') +
      (has('condicoes') && orc.condicoes ? '<div class="report__block"><h4>Condições de pagamento</h4><div>' + U.esc(orc.condicoes) + '</div></div>' : '') +
      (has('observacoes') && orc.observacoes ? '<div class="report__block"><h4>Observações</h4><div>' + U.esc(orc.observacoes) + '</div></div>' : '') +
      '<div class="report__sign">' +
        '<div><div class="line">Cliente / Responsável</div></div>' +
        '<div><div class="line">Técnico responsável</div></div>' +
      '</div>' +
      footer +
    '</div>';
  };

  /* ============================================================
     LISTA DE ORÇAMENTOS
     ============================================================ */
  const st = { status: 'todas', q: '', sort: 'recent' };

  function filtered() {
    let l = S.orcamentos();
    if (st.status !== 'todas') l = l.filter((o) => o.status === st.status);
    if (st.q) {
      const q = st.q.toLowerCase();
      l = l.filter((o) => {
        const produtos = (o.itens || []).map((i) => i.produto).join(' ');
        return (o.numero + ' ' + o.tecnico + ' ' + clienteNome(o) + ' ' + produtos).toLowerCase().includes(q);
      });
    }
    const sorts = {
      recent: (a, b) => b.criadoEm - a.criadoEm,
      numero: (a, b) => b.numero.localeCompare(a.numero),
      valor: (a, b) => b.valorTotal - a.valorTotal,
      cliente: (a, b) => clienteNome(a).localeCompare(clienteNome(b))
    };
    return l.slice().sort(sorts[st.sort] || sorts.recent);
  }

  function countByStatus() {
    const c = { aberto: 0, aprovado: 0, recusado: 0 };
    S.orcamentos().forEach((o) => { if (c[o.status] != null) c[o.status]++; });
    c.todas = S.orcamentos().length;
    return c;
  }

  function tableHtml(list) {
    const rows = list.map((orc) => {
      const first = orc.itens && orc.itens.length ? orc.itens[0].produto : '—';
      return '<tr data-action="open-orc" data-id="' + orc.id + '" role="link" tabindex="0" aria-label="Abrir orçamento ' + orc.numero + '">' +
        '<td><div class="table__cell-main">' + orc.numero + '</div><div class="table__cell-sub">' + U.date(orc.criadoEm) + '</div></td>' +
        '<td><div class="table__cell-main">' + U.esc(clienteNome(orc)) + '</div></td>' +
        '<td class="hide-sm"><div class="table__cell-sub">' + U.esc(first) + '</div></td>' +
        '<td>' + orcValidadePill(orc) + '</td>' +
        '<td class="num">' + U.money(orc.valorTotal) + '</td>' +
        '<td>' + orcChip(orc.status) + '</td>' +
        '<td><div class="table__actions">' +
          '<button class="icon-btn act" title="Imprimir orçamento" data-action="orc:print" data-id="' + orc.id + '">' + U.icon('print') + '</button>' +
          '<button class="icon-btn act" title="Baixar PDF" data-action="orc:pdf" data-id="' + orc.id + '">' + U.icon('download') + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="card">' +
      '<div class="table-wrap"><table class="table">' +
        '<thead><tr>' +
          '<th>Nº</th><th>Cliente</th><th class="hide-sm">Produto(s)</th><th>Validade</th><th class="num">Total</th><th>Status</th><th style="text-align:right">Ações</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
    '</div>';
  }

  function emptyHtml() {
    return '<div class="card"><div class="empty">' +
      '<div class="empty__icon">' + U.icon('receipt') + '</div>' +
      '<h3>' + (st.q ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento aqui') + '</h3>' +
      '<p>' + (st.q ? 'Tente ajustar a busca ou os filtros de status.' : 'Crie um orçamento com os itens e a validade para enviar ao cliente.') + '</p>' +
      (st.q ? '<button class="btn btn--tonal" data-action="orc:clear">Limpar busca</button>' : '<button class="btn btn--filled" data-action="nav" data-route="orcform">' + U.icon('plus') + ' Novo orçamento</button>') +
    '</div></div>';
  }

  function refreshList() {
    const wrap = document.getElementById('orcListWrap');
    if (!wrap) return;
    const list = filtered();
    wrap.innerHTML = list.length ? tableHtml(list) : emptyHtml();
    const cnt = document.getElementById('orcCount');
    if (cnt) cnt.textContent = list.length + ' orçamento' + (list.length === 1 ? '' : 's') + ' encontrado' + (list.length === 1 ? '' : 's');
  }

  function chipRow(counts) {
    const order = ['todas', 'aberto', 'aprovado', 'recusado'];
    const labels = { todas: 'Todos', aberto: 'Abertos', aprovado: 'Aprovados', recusado: 'Recusados' };
    return order.map((k) =>
      '<button class="fchip' + (st.status === k ? ' active' : '') + '" data-action="orc:filter" data-status="' + k + '">' +
        labels[k] + '<span class="count">' + counts[k] + '</span>' +
      '</button>'
    ).join('');
  }

  views.orcamentos = {
    render() {
      const counts = countByStatus();
      const list = filtered();
      return '' +
        '<div class="page-head">' +
          '<div>' +
            '<h1>Orçamentos <span class="badge">' + U.icon('receipt', 14) + ' ' + counts.todas + ' no total</span></h1>' +
            '<p class="page-head__sub">Crie orçamentos com itens e validade e imprima para o cliente.</p>' +
          '</div>' +
          '<div class="page-actions">' +
            (App.auth.can('orc:modelo')
              ? '<button class="btn btn--outlined" data-action="orc:modelo">' + U.icon('gear') + ' Modelo</button>'
              : '') +
            '<button class="btn btn--filled" data-action="nav" data-route="orcform">' + U.icon('plus') + ' Novo orçamento</button>' +
          '</div>' +
        '</div>' +

        '<div class="card filter-bar">' +
          '<div class="filter-bar__search">' + U.icon('search') +
            '<input type="text" placeholder="Buscar por nº, cliente, técnico ou produto…" data-input="orc:search" value="' + U.esc(st.q) + '">' +
          '</div>' +
          '<select class="field-select" data-change="orc:sort" title="Ordenar por">' +
            '<option value="recent"' + (st.sort === 'recent' ? ' selected' : '') + '>Mais recentes</option>' +
            '<option value="numero"' + (st.sort === 'numero' ? ' selected' : '') + '>Nº do orçamento</option>' +
            '<option value="valor"' + (st.sort === 'valor' ? ' selected' : '') + '>Maior valor</option>' +
            '<option value="cliente"' + (st.sort === 'cliente' ? ' selected' : '') + '>Cliente (A–Z)</option>' +
          '</select>' +
        '</div>' +

        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">' + chipRow(counts) + '</div>' +
        '<div id="orcCount" style="font-size:.82rem;color:var(--text-3);margin-bottom:12px">' + list.length + ' orçamento' + (list.length === 1 ? '' : 's') + ' encontrado' + (list.length === 1 ? '' : 's') + '</div>' +
        '<div id="orcListWrap">' + (list.length ? tableHtml(list) : emptyHtml()) + '</div>' +

        '<button class="fab" data-action="nav" data-route="orcform" title="Novo orçamento">' + U.icon('plus', 26) + '</button>';
    },
    mount() { App.onClientCreated = null; }
  };

  actions['orc:filter'] = function (d) {
    st.status = d.status;
    App.reload();
  };
  actions['orc:clear'] = function () {
    st.q = '';
    st.status = 'todas';
    App.reload();
  };
  inputs['orc:search'] = function (el) {
    st.q = el.value;
    refreshList();
  };
  changes['orc:sort'] = function (el) {
    st.sort = el.value;
    refreshList();
  };

  /* ---------- documentos (PDFs salvos, compartilhado com a OS) ---------- */

  function fmtBytes(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  App.docListHtml = function (lista, tipo) {
    if (!lista || !lista.length) {
      return '<p class="muted" style="font-size:.85rem;margin-top:10px">Nenhum PDF salvo. Gere o PDF para guardá-lo aqui e baixá-lo novamente quando precisar.</p>';
    }
    const delPerm = tipo === 'os' ? 'os:excluir' : 'orc:excluir';
    const delAct = tipo === 'os' ? 'os:docdel' : 'orc:docdel';
    return '<div class="doc-list" style="margin-top:12px">' + lista.map((d) =>
      '<div class="doc-row">' +
        '<div class="doc-row__icon">' + U.icon('receipt') + '</div>' +
        '<div class="doc-row__body">' +
          '<div class="doc-row__name">' + U.esc(d.nome) + '</div>' +
          '<div class="doc-row__sub">' + U.dateTime(d.criadoEm) + (d.tamanho ? ' · ' + fmtBytes(d.tamanho) : '') + '</div>' +
        '</div>' +
        '<a class="icon-btn" href="/api/documentos/' + d.id + '" download title="Baixar PDF">' + U.icon('download') + '</a>' +
        (App.auth.can(delPerm)
          ? '<button class="icon-btn danger" data-action="' + delAct + '" data-doc-id="' + d.id + '" title="Excluir PDF">' + U.icon('trash') + '</button>'
          : '') +
      '</div>'
    ).join('') + '</div>';
  };

  function findDoc(docId) {
    for (const o of S.ordens()) {
      const d = (o.documentos || []).find((x) => x.id === docId);
      if (d) return { doc: d, tipo: 'ordem' };
    }
    for (const o of S.orcamentos()) {
      const d = (o.documentos || []).find((x) => x.id === docId);
      if (d) return { doc: d, tipo: 'orcamento' };
    }
    return null;
  }

  function confirmDocDelete(docId) {
    if (!App.auth.can('os:excluir') && !App.auth.can('orc:excluir')) {
      U.snackbar('Apenas administradores podem excluir PDFs.', 'error');
      return;
    }
    const f = findDoc(docId);
    if (!f) return;
    U.confirm({
      title: 'Excluir ' + f.doc.nome,
      message: 'O PDF será removido do histórico.',
      confirmLabel: 'Excluir PDF',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.removeDocumento(f.doc.id)
        .then(() => { U.snackbar('PDF excluído.', 'info'); App.reload(); })
        .catch((err) => U.erro(err, 'Erro ao excluir PDF:'));
    });
  }

  actions['os:docdel'] = function (d) { confirmDocDelete(d.docId); };
  actions['orc:docdel'] = function (d) { confirmDocDelete(d.docId); };

  /* ============================================================
     DETALHE DO ORÇAMENTO
     ============================================================ */

  function statusAcoes(orc) {
    if (orc.status === 'aberto') {
      return '<div class="btn-row" style="margin-top:12px">' +
        '<button class="btn btn--filled" data-action="orc:advance" data-id="' + orc.id + '" data-to="aprovado">' + U.icon('check') + ' Aprovar orçamento</button>' +
        '<button class="btn btn--outlined" data-action="orc:advance" data-id="' + orc.id + '" data-to="recusado">' + U.icon('close') + ' Recusar</button>' +
      '</div>' +
      '<div class="card__sub" style="margin-top:10px">Ao aprovar, você poderá abrir uma ordem de serviço a partir deste orçamento.</div>';
    }
    if (orc.status === 'aprovado') {
      return '<div class="banner banner--success" style="margin-top:4px">' + U.icon('check') + '<span><strong>Orçamento aprovado.</strong> Abra a ordem de serviço para iniciar o atendimento.</span></div>' +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button class="btn btn--filled" data-action="orc:os" data-id="' + orc.id + '">' + U.icon('orders') + ' Abrir ordem de serviço</button>' +
          '<button class="btn btn--text" data-action="orc:advance" data-id="' + orc.id + '" data-to="aberto">' + U.icon('restart') + ' Reabrir orçamento</button>' +
        '</div>';
    }
    // recusado
    return '<div class="banner banner--danger" style="margin-top:4px">' + U.icon('warning') + '<span><strong>Orçamento recusado.</strong></span></div>' +
      '<button class="btn btn--text" style="margin-top:12px" data-action="orc:advance" data-id="' + orc.id + '" data-to="aberto">' + U.icon('restart') + ' Reabrir orçamento</button>';
  }

  views.orcamentoDetail = {
    render(param) {
      const orc = S.getOrcamento(param);
      if (!orc) {
        return '<div class="card"><div class="empty"><div class="empty__icon">' + U.icon('warning') + '</div><h3>Orçamento não encontrado</h3><p>Ele pode ter sido excluído.</p><button class="btn btn--filled" data-action="nav" data-route="orcamentos">Voltar para orçamentos</button></div></div>';
      }
      const cli = S.getCliente(orc.clienteId);
      const itens = orc.itens || [];

      return '' +
        '<div class="page-head">' +
          '<div style="display:flex;gap:12px;align-items:flex-start">' +
            '<button class="icon-btn" data-action="nav" data-route="orcamentos" title="Voltar">' + U.icon('back') + '</button>' +
            '<div>' +
              '<h1>' + orc.numero + ' ' + orcChip(orc.status) + '</h1>' +
              '<p class="page-head__sub">Criado em ' + U.dateTime(orc.criadoEm) + ' · ' + U.esc(cli ? cli.nome : '—') + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="page-actions">' +
            '<button class="btn btn--tonal" data-action="orc:print" data-id="' + orc.id + '">' + U.icon('print') + ' Imprimir</button>' +
            '<button class="btn btn--outlined" data-action="orc:pdf" data-id="' + orc.id + '">' + U.icon('download') + ' PDF</button>' +
            (App.auth.can('orc:editar')
              ? '<button class="btn btn--outlined" data-action="orc:edit" data-id="' + orc.id + '">' + U.icon('edit') + ' Editar</button>'
              : '') +
            (App.auth.can('orc:excluir')
              ? '<button class="icon-btn danger" data-action="orc:delete" data-id="' + orc.id + '" title="Excluir orçamento">' + U.icon('trash') + '</button>'
              : '') +
          '</div>' +
        '</div>' +

        '<div class="grid grid--2" style="align-items:start">' +
          '<div class="stack">' +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('receipt') + ' Dados do orçamento</div>' +
              '<div class="dl" style="margin-top:8px">' +
                '<div class="dl__row"><span class="lbl">' + U.icon('calendar', 16) + ' Validade</span><span class="val">' + orcValidadePill(orc) + '</span></div>' +
                '<div class="dl__row"><span class="lbl">' + U.icon('user', 16) + ' Técnico responsável</span><span class="val">' + U.esc(orc.tecnico || '—') + '</span></div>' +
                '<div class="dl__row"><span class="lbl">' + U.icon('clock', 16) + ' Criado em</span><span class="val">' + U.dateTime(orc.criadoEm) + '</span></div>' +
              '</div>' +
            '</div>' +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('bag') + ' Itens do orçamento <span style="margin-left:auto;font-size:.8rem;color:var(--text-3)">' + itens.length + ' item(ns)</span></div>' +
              '<div class="table-wrap" style="margin-top:12px"><table class="table" style="min-width:480px">' +
                '<thead><tr><th>Qtd</th><th>Produto</th><th class="num">Valor unit.</th><th class="num">Subtotal</th></tr></thead>' +
                '<tbody>' + itens.map((it) =>
                  '<tr>' +
                    '<td>' + it.qtd + '</td>' +
                    '<td><div class="table__cell-main">' + U.esc(it.produto) + '</div>' + (it.marca ? '<div class="table__cell-sub">' + U.esc(it.marca) + '</div>' : '') + '</td>' +
                    '<td class="num">' + U.money(it.valor) + '</td>' +
                    '<td class="num">' + U.money(it.valor * it.qtd) + '</td>' +
                  '</tr>'
                ).join('') + '</tbody>' +
                '<tfoot><tr><td colspan="3" style="text-align:right;padding:12px 18px;font-weight:700">Total</td>' +
                  '<td class="num" style="padding:12px 18px;font-weight:800;color:var(--primary)">' + U.money(orc.valorTotal) + '</td></tr></tfoot>' +
              '</table></div>' +
            '</div>' +

            (orc.descricao
              ? '<div class="card card--pad"><div class="card__title">' + U.icon('note') + ' Descrição do serviço</div><p style="font-size:.92rem;color:var(--text-2);margin-top:8px">' + U.esc(orc.descricao) + '</p></div>'
              : '') +
            (orc.condicoes
              ? '<div class="card card--pad"><div class="card__title">' + U.icon('info') + ' Condições de pagamento</div><p style="font-size:.92rem;color:var(--text-2);margin-top:8px">' + U.esc(orc.condicoes) + '</p></div>'
              : '') +
            (orc.observacoes
              ? '<div class="card card--pad"><div class="card__title">' + U.icon('note') + ' Observações</div><p style="font-size:.88rem;color:var(--text-2);margin-top:8px">' + U.esc(orc.observacoes) + '</p></div>'
              : '') +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('download') + ' Documentos <span style="margin-left:auto;font-size:.8rem;color:var(--text-3)">' + (orc.documentos || []).length + ' PDF(s)</span></div>' +
              App.docListHtml(orc.documentos || [], 'orc') +
            '</div>' +

          '</div>' +

          '<div class="stack">' +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('clients') + ' Cliente</div>' +
              '<div style="display:flex;gap:13px;align-items:center;margin-top:14px">' +
                U.avatar(cli ? cli.nome : '—', 'avatar--lg') +
                '<div><div style="font-weight:600;font-size:1rem">' + U.esc(cli ? cli.nome : '—') + '</div><div class="muted" style="font-size:.8rem">ID ' + (cli ? cli.id : '—') + '</div></div>' +
              '</div>' +
              '<div style="margin-top:12px">' +
                '<div class="info-row">' + U.icon('phone', 16) + '<span>' + U.esc(cli ? cli.telefone : '—') + '</span></div>' +
                '<div class="info-row">' + U.icon('mail', 16) + '<span>' + U.esc(cli ? cli.email : '—') + '</span></div>' +
                '<div class="info-row">' + U.icon('pin', 16) + '<span>' + U.esc(cli ? cli.endereco : '—') + '</span></div>' +
              '</div>' +
            '</div>' +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('money') + ' Valores</div>' +
              '<div class="dl" style="margin-top:8px">' +
                '<div class="dl__row"><span class="lbl">Total do orçamento</span><span class="val text-primary fw-600">' + U.money(orc.valorTotal) + '</span></div>' +
                '<div class="dl__row"><span class="lbl">Validade</span><span class="val">' + U.date(orc.validade) + '</span></div>' +
              '</div>' +
            '</div>' +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('trend') + ' Situação</div>' +
              statusAcoes(orc) +
            '</div>' +

          '</div>' +
        '</div>';
    },
    mount() { /* delegação */ }
  };

  /* ---------- ações do detalhe ---------- */

  let orcBusy = false;

  function criarOsDeOrcamento(orc) {
    const primeiro = orc.itens && orc.itens.length ? orc.itens[0] : null;
    return S.addOrdem({
      clienteId: orc.clienteId,
      equipamento: primeiro ? primeiro.produto : 'Serviço técnico',
      marca: (primeiro && primeiro.marca) || '',
      descricao: orc.descricao || 'Serviço referente ao orçamento ' + orc.numero,
      prioridade: 'media',
      valorEstimado: orc.valorTotal,
      prazo: '',
      tecnico: orc.tecnico || '',
      observacoes: 'Criada a partir do orçamento ' + orc.numero + ' (aprovado em ' + U.date(Date.now()) + ').'
    });
  }

  function aprovarDialog(orc) {
    U.dialog({
      title: 'Aprovar ' + orc.numero,
      icon: 'check',
      body:
        '<p class="dialog__msg">O orçamento será marcado como aprovado. Você pode abrir a ordem de serviço já nesta etapa, sem passos extras.</p>' +
        '<label class="switch" style="margin-top:18px">' +
          '<input type="checkbox" id="dlgAbrirOS" checked>' +
          '<span class="switch__slider"></span>' +
          '<span>Abrir ordem de serviço automaticamente</span>' +
        '</label>',
      actions: [
        { id: 'ok', label: 'Aprovar orçamento', kind: 'filled', icon: 'check' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'ok' || orcBusy) return;
        const abrirOS = document.getElementById('dlgAbrirOS').checked;
        orcBusy = true;
        S.avancarOrcStatus(orc.id, 'aprovado')
          .then(() => (abrirOS ? criarOsDeOrcamento(orc) : null))
          .then((os) => {
            orcBusy = false;
            done();
            if (os) {
              U.snackbar('Orçamento aprovado e OS ' + os.numero + ' aberta automaticamente!', 'success');
              App.go('ordem/' + os.id);
            } else {
              U.snackbar('Orçamento ' + orc.numero + ' aprovado.', 'success');
              App.reload();
            }
          })
          .catch((err) => { orcBusy = false; U.erro(err, 'Erro:'); });
      }
    });
  }

  actions['orc:advance'] = function (d) {
    if (orcBusy) return;
    const orc = S.getOrcamento(d.id);
    if (!orc) return;
    const to = d.to;
    if (to === 'aprovado') { aprovarDialog(orc); return; }
    if (to === 'recusado') {
      U.confirm({
        title: 'Recusar ' + orc.numero,
        message: 'O orçamento será marcado como recusado.',
        confirmLabel: 'Recusar orçamento',
        danger: true
      }).then((ok) => {
        if (!ok) return;
        orcBusy = true;
        S.avancarOrcStatus(orc.id, 'recusado')
          .then(() => { orcBusy = false; U.snackbar('Orçamento recusado.', 'warn'); App.reload(); })
          .catch((err) => { orcBusy = false; U.erro(err, 'Erro:'); });
      });
      return;
    }
    orcBusy = true;
    S.avancarOrcStatus(orc.id, 'aberto')
      .then(() => { orcBusy = false; U.snackbar('Orçamento reaberto.', 'success'); App.reload(); })
      .catch((err) => { orcBusy = false; U.erro(err, 'Erro:'); });
  };

  actions['orc:edit'] = function (d) {
    App.go('orcform/' + d.id);
  };

  /* ---------- modelo de impressão (admin) ---------- */

  actions['orc:modelo'] = function () {
    if (!App.auth.can('orc:modelo')) { U.snackbar('Apenas administradores podem editar o modelo.', 'error'); return; }
    const m = S.orcModelo() || { obsPadrao: '', rodape: '', campos: [] };
    const campos = m.campos || [];
    const FIELD_LABELS = {
      cliente_contato: 'Contato do cliente (telefone, e-mail e endereço)',
      marca: 'Marca nos itens',
      descricao: 'Bloco "Descrição do serviço"',
      condicoes: 'Bloco "Condições de pagamento"',
      observacoes: 'Bloco "Observações"'
    };
    const toggles = Object.keys(FIELD_LABELS).map((k) =>
      '<label class="switch" style="margin-top:12px">' +
        '<input type="checkbox" id="modCampo_' + k + '"' + (campos.indexOf(k) !== -1 ? ' checked' : '') + '>' +
        '<span class="switch__slider"></span>' +
        '<span>' + U.esc(FIELD_LABELS[k]) + '</span>' +
      '</label>'
    ).join('');
    U.dialog({
      title: 'Modelo do orçamento',
      icon: 'gear',
      size: 'lg',
      body:
        '<p class="dialog__msg">Personalize o layout do orçamento impresso: campos exibidos, observações padrão e texto do rodapé.</p>' +
        '<div class="field" style="margin-top:18px"><label>Observações padrão (novos orçamentos)</label>' +
          '<textarea id="modObs" rows="2" placeholder="Ex.: Peças com garantia de 90 dias…">' + U.esc(m.obsPadrao || '') + '</textarea></div>' +
        '<div class="field" style="margin-top:16px"><label>Texto do rodapé (impressão)</label>' +
          '<textarea id="modRodape" rows="2" placeholder="Deixe vazio para usar o rodapé padrão do sistema.">' + U.esc(m.rodape || '') + '</textarea></div>' +
        '<div style="margin-top:20px;padding-top:16px;border-top:1px dashed var(--border)">' +
          '<div class="card__sub" style="margin-bottom:4px">Campos exibidos na impressão</div>' + toggles +
        '</div>',
      actions: [
        { id: 'save', label: 'Salvar modelo', kind: 'filled', icon: 'check' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'save') return;
        const camposSel = Object.keys(FIELD_LABELS).filter((k) => document.getElementById('modCampo_' + k).checked);
        return S.setOrcModelo({
          obsPadrao: document.getElementById('modObs').value,
          rodape: document.getElementById('modRodape').value,
          campos: camposSel
        })
          .then(() => {
            U.snackbar('Modelo do orçamento atualizado.', 'success');
            done();
            App.reload();
          })
          .catch((err) => U.erro(err, 'Erro ao salvar modelo:'));
      }
    });
  };

  actions['orc:delete'] = function (d) {
    if (!App.auth.can('orc:excluir')) { U.snackbar('Apenas administradores podem excluir orçamentos.', 'error'); return; }
    const orc = S.getOrcamento(d.id);
    if (!orc) return;
    U.confirm({
      title: 'Excluir ' + orc.numero,
      message: 'O orçamento será removido permanentemente. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir orçamento',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.removeOrcamento(orc.id)
        .then(() => {
          U.snackbar('Orçamento ' + orc.numero + ' excluído.', 'error');
          App.go('orcamentos');
        })
        .catch((err) => U.erro(err, 'Erro ao excluir:'));
    });
  };

  actions['orc:print'] = function (d) {
    const orc = S.getOrcamento(d.id);
    if (!orc) return;
    U.printReport(App.buildOrcReport(S.empresa(), orc));
  };

  actions['orc:pdf'] = function (d) {
    const orc = S.getOrcamento(d.id);
    if (!orc) return;
    U.snackbar('Gerando PDF…', 'info');
    U.buildPdf(App.buildOrcReport(S.empresa(), orc))
      .then(({ pdf, base64 }) => {
        const nome = 'Orcamento-' + orc.numero + '.pdf';
        pdf.save(nome);
        // guarda uma cópia no histórico do orçamento (reimpressão posterior)
        return S.addDocumento('orcamento', orc.id, nome, base64)
          .then(() => U.snackbar('PDF gerado e salvo no histórico do orçamento.', 'success'))
          .catch(() => U.snackbar('PDF baixado (não foi possível salvá-lo no histórico).', 'warn'));
      })
      .catch((err) => U.erro(err, 'Erro ao gerar PDF:'));
  };

  actions['orc:os'] = function (d) {
    const orc = S.getOrcamento(d.id);
    if (!orc || orc.status !== 'aprovado') return;
    U.confirm({
      title: 'Abrir OS a partir de ' + orc.numero,
      message: 'Será criada uma ordem de serviço com os dados deste orçamento (cliente, técnico, produto e valor estimado).',
      confirmLabel: 'Abrir ordem de serviço'
    }).then((ok) => {
      if (!ok) return;
      criarOsDeOrcamento(orc)
        .then((os) => {
          U.snackbar('OS ' + os.numero + ' aberta a partir do orçamento.', 'success');
          App.go('ordem/' + os.id);
        })
        .catch((err) => U.erro(err, 'Erro ao abrir a OS:'));
    });
  };

  /* ============================================================
     FORMULÁRIO (novo / editar)
     ============================================================ */

  let form = null;

  function emptyItem() {
    return { produtoId: '', produto: '', marca: '', valor: '', qtd: 1 };
  }

  function refreshRowSub(i) {
    const row = document.querySelector('.orc-item[data-i="' + i + '"]');
    if (!row) return;
    const it = form.itens[i] || {};
    const sub = (parseFloat(it.valor) || 0) * (parseInt(it.qtd, 10) || 1);
    const el = row.querySelector('[data-sub]');
    if (el) el.textContent = U.money(sub);
    refreshTotal();
  }

  function refreshTotal() {
    const el = document.getElementById('orcTotal');
    if (!el) return;
    const total = (form.itens || []).reduce(
      (s, it) => s + (parseFloat(it.valor) || 0) * (parseInt(it.qtd, 10) || 1), 0
    );
    el.textContent = U.money(total);
  }

  function itemRowHtml(i) {
    const it = form.itens[i];
    const sub = (parseFloat(it.valor) || 0) * (parseInt(it.qtd, 10) || 1);
    return '<div class="orc-item" data-i="' + i + '">' +
      '<div class="orc-item__prod">' +
        '<select data-change="orc:itemprod" data-i="' + i + '" aria-label="Produto do item">' + prodOptions(it.produtoId) + '</select>' +
        '<button type="button" class="icon-btn" data-action="orc:addprod" data-i="' + i + '" title="Cadastrar produto">' + U.icon('plus') + '</button>' +
      '</div>' +
      '<input type="number" step="0.01" min="0" class="orc-item__val" data-input="orc:itemval" data-i="' + i + '" value="' + (it.valor != null && it.valor !== '' ? it.valor : '') + '" placeholder="Valor unit." aria-label="Valor unitário">' +
      '<input type="number" min="1" class="orc-item__qtd" data-input="orc:itemqtd" data-i="' + i + '" value="' + (it.qtd || 1) + '" aria-label="Quantidade">' +
      '<div class="orc-item__sub" data-sub>' + U.money(sub) + '</div>' +
      '<button type="button" class="icon-btn danger" data-action="orc:delitem" data-i="' + i + '" title="Remover item">' + U.icon('close') + '</button>' +
    '</div>';
  }

  function renderItems() {
    const wrap = document.getElementById('orcItems');
    if (!wrap) return;
    wrap.innerHTML = form.itens.map((_, i) => itemRowHtml(i)).join('');
    refreshTotal();
  }

  views['orcform'] = {
    render(param) {
      const editing = !!param;
      const o = editing ? S.getOrcamento(param) : null;
      if (editing && !o) {
        return '<div class="card"><div class="empty"><div class="empty__icon">' + U.icon('warning') + '</div><h3>Orçamento não encontrado</h3><p>Ele pode ter sido excluído.</p><button class="btn btn--filled" data-action="nav" data-route="orcamentos">Voltar para orçamentos</button></div></div>';
      }
      form = {
        id: o ? o.id : null,
        clienteId: o ? o.clienteId : '',
        tecnico: o ? o.tecnico : '',
        validade: o && o.validade ? U.dateStr(new Date(o.validade)) : '',
        itens: o && o.itens && o.itens.length
          ? o.itens.map((it) => ({
              produtoId: it.produtoId || '',
              produto: it.produto || '',
              marca: it.marca || '',
              valor: it.valor,
              qtd: it.qtd || 1
            }))
          : [emptyItem()],
        descricao: o ? o.descricao : '',
        // novos orçamentos já nascem com as observações padrão do modelo
        observacoes: o ? o.observacoes : ((S.orcModelo() || {}).obsPadrao || ''),
        condicoes: o ? o.condicoes : ''
      };

      const clientes = S.clientes();
      const cliOpts = clientes.length
        ? clientes.map((c) => '<option value="' + c.id + '"' + (form.clienteId === c.id ? ' selected' : '') + '>' + U.esc(c.nome) + '</option>').join('')
        : '<option value="">Nenhum cliente cadastrado</option>';

      return '' +
        '<div class="page-head">' +
          '<div style="display:flex;gap:12px;align-items:flex-start">' +
            '<button class="icon-btn" data-action="nav" data-route="orcamentos" title="Voltar">' + U.icon('back') + '</button>' +
            '<div>' +
              '<h1>' + (editing ? 'Editar orçamento' : 'Novo orçamento') + (o ? ' · ' + o.numero : '') + '</h1>' +
              '<p class="page-head__sub">Preencha os itens e a validade. Campos com * são obrigatórios.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card card--pad">' +
          '<div class="form-grid">' +

            '<div class="field">' +
              '<label>Cliente *</label>' +
              '<div style="display:flex;gap:8px">' +
                '<select id="orcCliente" style="flex:1"><option value="">Selecione o cliente…</option>' + cliOpts + '</select>' +
                '<button type="button" class="btn btn--tonal" data-action="cli:new" data-from="orc" title="Cadastrar novo cliente">' + U.icon('plus') + '</button>' +
              '</div>' +
              '<div class="field__err">Selecione ou cadastre um cliente.</div>' +
            '</div>' +

            '<div class="field">' +
              '<label>Técnico responsável</label>' +
              '<select id="orcTec">' + tecOptions() + '</select>' +
            '</div>' +

            '<div class="field">' +
              '<label>Validade * <span class="muted" style="text-transform:none">(inserida manualmente)</span></label>' +
              '<input id="orcValidade" type="date" value="' + form.validade + '" title="Informe até quando o orçamento é válido">' +
              '<div class="field__err">Informe a data de validade do orçamento.</div>' +
            '</div>' +

          '</div>' +

          '<div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--border)">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
              '<div class="card__title">' + U.icon('bag') + ' Itens do orçamento *</div>' +
              '<button type="button" class="btn btn--tonal btn--sm" data-action="orc:additem">' + U.icon('plus', 15) + ' Adicionar item</button>' +
            '</div>' +
            '<div class="card__sub" style="margin-bottom:14px">Escolha o produto do catálogo — ou cadastre um novo com o botão + — informe valor e quantidade.</div>' +
            '<div class="orc-items" id="orcItems">' + form.itens.map((_, i) => itemRowHtml(i)).join('') + '</div>' +
            '<div class="orc-items__foot">' +
              '<span class="muted" style="font-size:.82rem">Total</span>' +
              '<span class="orc-total" id="orcTotal">' + U.money(0) + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="form-grid" style="margin-top:22px">' +
            '<div class="field span-2">' +
              '<label>Descrição do serviço (opcional)</label>' +
              '<textarea id="orcDesc" rows="2" placeholder="Ex.: manutenção preventiva, instalação, orçamento de peças…">' + U.esc(form.descricao) + '</textarea>' +
            '</div>' +
            '<div class="field">' +
              '<label>Condições de pagamento (opcional)</label>' +
              '<textarea id="orcCond" rows="2" placeholder="Ex.: 50% de entrada e 50% na entrega, parcelado em até 3x…">' + U.esc(form.condicoes) + '</textarea>' +
            '</div>' +
            '<div class="field">' +
              '<label>Observações (opcional)</label>' +
              '<textarea id="orcObs" rows="2" placeholder="Observações gerais…">' + U.esc(form.observacoes) + '</textarea>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;border-top:1px solid var(--border);padding-top:18px">' +
            '<button class="btn btn--text" data-action="orc:reset">Limpar</button>' +
            '<button class="btn btn--filled btn--lg" data-action="orc:create">' + U.icon('check') + (editing ? ' Salvar alterações' : ' Salvar orçamento') + '</button>' +
          '</div>' +
        '</div>';
    },
    mount() {
      const tec = document.getElementById('orcTec');
      if (tec && form && form.tecnico) tec.value = form.tecnico;
      refreshTotal();
      // gancho usado pelo dialog de novo cliente (clientes.js)
      App.onClientCreated = () => {
        const clientes = S.clientes();
        if (form) form.clienteId = clientes.length ? clientes[clientes.length - 1].id : '';
        App.reload();
      };
    }
  };

  /* ---------- editor de itens ---------- */

  changes['orc:itemprod'] = function (el, d) {
    const i = parseInt(d.i, 10);
    if (!form || !form.itens[i]) return;
    const p = S.getProduto(el.value);
    if (p) {
      form.itens[i].produtoId = p.id;
      form.itens[i].produto = p.nome;
      form.itens[i].marca = p.marca || '';
      form.itens[i].valor = p.valor != null ? p.valor : form.itens[i].valor;
      const valEl = el.closest('.orc-item').querySelector('[data-input="orc:itemval"]');
      if (valEl) valEl.value = p.valor != null ? p.valor : '';
    } else {
      form.itens[i].produtoId = '';
      form.itens[i].produto = '';
      form.itens[i].marca = '';
    }
    refreshRowSub(i);
  };
  inputs['orc:itemval'] = function (el, d) {
    const i = parseInt(d.i, 10);
    if (form && form.itens[i]) form.itens[i].valor = el.value;
    refreshRowSub(i);
  };
  inputs['orc:itemqtd'] = function (el, d) {
    const i = parseInt(d.i, 10);
    if (form && form.itens[i]) form.itens[i].qtd = el.value;
    refreshRowSub(i);
  };
  actions['orc:additem'] = function () {
    if (!form) return;
    form.itens.push(emptyItem());
    renderItems();
  };
  actions['orc:delitem'] = function (d) {
    if (!form) return;
    const i = parseInt(d.i, 10);
    if (form.itens.length <= 1) { U.snackbar('O orçamento precisa de ao menos um item.', 'warn'); return; }
    form.itens.splice(i, 1);
    renderItems();
  };

  /* ---------- cadastro/edição de produto (compartilhado com a Nova OS) ---------- */

  let lastProd = null;
  App.productDialog = function (prod) {
    const editing = !!prod;
    lastProd = null;
    return U.dialog({
      title: editing ? 'Editar produto' : 'Cadastrar produto',
      icon: 'receipt',
      body:
        '<div class="field"><label>Nome do produto *</label>' +
        '<input id="prodNome" value="' + U.esc(prod ? prod.nome : '') + '" placeholder="Ex.: Fonte 12V 5A">' +
        '<div class="field__err">Informe o nome do produto.</div></div>' +
        '<div class="grid grid--2-1" style="margin-top:16px">' +
          '<div class="field"><label>Marca</label><input id="prodMarca" value="' + U.esc(prod ? prod.marca : '') + '" placeholder="Ex.: Corsair"></div>' +
          '<div class="field"><label>Valor (R$)</label><input id="prodValor" type="number" step="0.01" min="0" placeholder="0,00" value="' + (prod && prod.valor != null ? prod.valor : '') + '"></div>' +
        '</div>',
      actions: [
        { id: 'save', label: editing ? 'Salvar alterações' : 'Salvar produto', kind: 'filled', icon: 'check' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'save') return;
        const nome = document.getElementById('prodNome').value.trim();
        if (!nome) {
          document.getElementById('prodNome').closest('.field').classList.add('field--error');
          return false;
        }
        const valor = parseFloat(document.getElementById('prodValor').value);
        const dados = {
          nome,
          marca: document.getElementById('prodMarca').value.trim(),
          valor: isNaN(valor) ? null : valor
        };
        const op = editing ? S.updateProduto(prod.id, dados) : S.addProduto(dados);
        return op
          .then((p) => {
            lastProd = p;
            U.snackbar(editing
              ? 'Produto "' + p.nome + '" atualizado.'
              : 'Produto "' + p.nome + '" cadastrado e salvo para uso futuro.', 'success');
            done();
          })
          .catch((err) => U.erro(err, 'Erro ao salvar produto:'));
      }
    }).then((id) => (id === 'save' ? lastProd : null));
  };

  actions['orc:addprod'] = function (d) {
    App.productDialog().then((p) => {
      if (!p || !form) return;
      const i = parseInt(d.i, 10);
      if (!isNaN(i) && form.itens[i]) {
        form.itens[i].produtoId = p.id;
        form.itens[i].produto = p.nome;
        form.itens[i].marca = p.marca || '';
        form.itens[i].valor = p.valor != null ? p.valor : '';
      }
      renderItems();
    });
  };

  /* ---------- salvar ---------- */

  actions['orc:reset'] = function () {
    if (!form) return;
    const tec = App.auth.current();
    form = {
      id: null, clienteId: '', tecnico: tec ? tec.nome : '', validade: '',
      itens: [emptyItem()], descricao: '', observacoes: '', condicoes: ''
    };
    App.reload();
    U.snackbar('Formulário limpo.', 'info');
  };

  actions['orc:create'] = function () {
    if (!form || orcBusy) return;
    const g = (id) => document.getElementById(id);
    const clienteId = g('orcCliente').value;
    const validade = g('orcValidade').value;

    // itens válidos: produto selecionado + valor numérico
    document.querySelectorAll('.orc-item--error').forEach((el) => el.classList.remove('orc-item--error'));
    const itens = [];
    let itensOk = true;
    form.itens.forEach((it, idx) => {
      const row = document.querySelector('.orc-item[data-i="' + idx + '"]');
      const val = parseFloat(it.valor);
      const p = S.getProduto(it.produtoId);
      const produto = p ? p.nome : (it.produto || '');
      if (!produto || isNaN(val) || val < 0 || !it.qtd || parseInt(it.qtd, 10) < 1) {
        itensOk = false;
        if (row) row.classList.add('orc-item--error');
      } else {
        itens.push({
          produtoId: it.produtoId,
          produto,
          marca: p ? p.marca : (it.marca || ''),
          valor: val,
          qtd: parseInt(it.qtd, 10)
        });
      }
    });

    let ok = true;
    [['orcCliente', clienteId], ['orcValidade', validade]].forEach(([id, val]) => {
      const bad = !val;
      const f = g(id).closest('.field');
      f.classList.toggle('field--error', bad);
      if (bad) ok = false;
    });
    if (!ok || !itensOk) {
      U.snackbar('Preencha os campos obrigatórios e os itens (produto + valor) antes de salvar.', 'error');
      return;
    }

    const payload = {
      clienteId,
      tecnico: g('orcTec').value,
      validade,
      itens,
      descricao: g('orcDesc').value.trim(),
      condicoes: g('orcCond').value.trim(),
      observacoes: g('orcObs').value.trim()
    };

    orcBusy = true;
    const op = form.id
      ? S.updateOrcamento(form.id, payload)
      : S.addOrcamento(payload);
    op.then((orc) => {
      orcBusy = false;
      U.snackbar('Orçamento ' + orc.numero + (form.id ? ' atualizado.' : ' salvo com sucesso!'), 'success');
      App.go('orcamento/' + orc.id);
    }).catch((err) => { orcBusy = false; U.erro(err, 'Erro ao salvar orçamento:'); });
  };
})(window);
