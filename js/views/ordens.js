/* ============================================================
   TechFix OS — Ordens de Serviço
   (lista + filtros, detalhe com stepper/timeline, nova OS)
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui, S = App.store;
  const views = (App.views = App.views || {});
  const actions = (App.actions = App.actions || {});
  const inputs = (App.inputs = App.inputs || {});
  const changes = (App.changes = App.changes || {});

  /* ---------- helpers compartilhados ---------- */

  App.osRow = function (os) {
    const cli = S.getCliente(os.clienteId);
    return '<div class="os-row" data-action="open-ordem" data-id="' + os.id + '" role="link" tabindex="0" aria-label="Abrir OS ' + os.numero + '">' +
      '<div class="os-row__num">' + os.numero + '</div>' +
      '<div class="os-row__body">' +
        '<div class="os-row__cli">' + U.esc(cli ? cli.nome : 'Cliente removido') + '</div>' +
        '<div class="os-row__sub">' + U.esc(os.equipamento) + '</div>' +
      '</div>' +
      '<div class="os-row__right">' + U.statusChip(os.status) + '<span class="os-row__date">' + U.date(os.dataAbertura) + '</span></div>' +
    '</div>';
  };

  function clienteNome(os) {
    const cli = S.getCliente(os.clienteId);
    return cli ? cli.nome : '—';
  }

  function tecOptions() {
    // opções reais: usuários ativos do sistema (vindos do bootstrap)
    const me = App.auth.current();
    const nomes = S.tecnicos().map((t) => t.nome);
    if (me && nomes.indexOf(me.nome) === -1) nomes.unshift(me.nome);
    return nomes.map((n) =>
      '<option' + (me && n === me.nome ? ' selected' : '') + '>' + U.esc(n) + '</option>'
    ).join('');
  }

  function valorOS(os) {
    return os.valorFinal != null ? os.valorFinal : os.valorEstimado;
  }

  /* ============================================================
     LISTA DE ORDENS
     ============================================================ */
  const st = { status: 'todas', q: '', sort: 'recent' };

  function filtered() {
    let l = S.ordens();
    if (st.status !== 'todas') l = l.filter((o) => o.status === st.status);
    if (st.q) {
      const q = st.q.toLowerCase();
      l = l.filter((o) =>
        (o.numero + ' ' + o.equipamento + ' ' + o.marca + ' ' + clienteNome(o)).toLowerCase().includes(q)
      );
    }
    const sorts = {
      recent: (a, b) => b.dataAbertura - a.dataAbertura,
      numero: (a, b) => b.numero.localeCompare(a.numero),
      valor: (a, b) => (valorOS(b) || 0) - (valorOS(a) || 0),
      cliente: (a, b) => clienteNome(a).localeCompare(clienteNome(b))
    };
    return l.slice().sort(sorts[st.sort] || sorts.recent);
  }

  function countByStatus() {
    const c = { aberta: 0, em_andamento: 0, aguardando: 0, concluida: 0, cancelada: 0 };
    S.ordens().forEach((o) => { if (c[o.status] != null) c[o.status]++; });
    c.todas = S.ordens().length;
    return c;
  }

  function tableHtml(list) {
    const rows = list.map((os) => {
      let quick = '';
      if (os.status === 'aberta') {
        quick = '<button class="icon-btn act" title="Iniciar atendimento" data-action="os:advance" data-id="' + os.id + '" data-to="em_andamento">' + U.icon('play') + '</button>';
      } else if (os.status === 'em_andamento' || os.status === 'aguardando') {
        quick = '<button class="icon-btn act icon-btn--ok" title="Finalizar OS" data-action="os:advance" data-id="' + os.id + '" data-to="concluida">' + U.icon('check') + '</button>';
      }
      return '<tr data-action="open-ordem" data-id="' + os.id + '" role="link" tabindex="0" aria-label="Abrir OS ' + os.numero + '">' +
        '<td><div class="table__cell-main">' + os.numero + '</div><div class="table__cell-sub">' + U.date(os.dataAbertura) + '</div></td>' +
        '<td><div class="table__cell-main">' + U.esc(clienteNome(os)) + '</div></td>' +
        '<td class="hide-sm"><div class="table__cell-sub">' + U.esc(os.equipamento) + '</div></td>' +
        '<td>' + U.priChip(os.prioridade) + '</td>' +
        '<td>' + U.statusChip(os.status) + '</td>' +
        '<td class="num">' + (valorOS(os) != null ? U.money(valorOS(os)) : '—') + '</td>' +
        '<td><div class="table__actions">' + quick +
          '<button class="icon-btn act" title="Imprimir relatório" data-action="os:print" data-id="' + os.id + '">' + U.icon('print') + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="card">' +
      '<div class="table-wrap"><table class="table">' +
        '<thead><tr>' +
          '<th>Nº OS</th><th>Cliente</th><th class="hide-sm">Produto</th><th>Prioridade</th><th>Status</th><th class="num">Valor</th><th style="text-align:right">Ações</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
    '</div>';
  }

  function emptyHtml() {
    return '<div class="card"><div class="empty">' +
      '<div class="empty__icon">' + U.icon('orders') + '</div>' +
      '<h3>' + (st.q ? 'Nenhuma ordem encontrada' : 'Nenhuma ordem aqui') + '</h3>' +
      '<p>' + (st.q ? 'Tente ajustar a busca ou os filtros de status.' : 'Aberta uma nova ordem de serviço para ela aparecer nesta listagem.') + '</p>' +
      (st.q ? '<button class="btn btn--tonal" data-action="os:clear">Limpar busca</button>' : '<button class="btn btn--filled" data-action="nav" data-route="nova">' + U.icon('plus') + ' Abrir OS</button>') +
    '</div></div>';
  }

  function refreshList() {
    const wrap = document.getElementById('osListWrap');
    if (!wrap) return;
    const list = filtered();
    wrap.innerHTML = list.length ? tableHtml(list) : emptyHtml();
    const cnt = document.getElementById('osCount');
    if (cnt) cnt.textContent = list.length + ' OS encontrada' + (list.length === 1 ? '' : 's');
  }

  function chipRow(counts) {
    const order = ['todas', 'aberta', 'em_andamento', 'aguardando', 'concluida', 'cancelada'];
    const labels = { todas: 'Todas', aberta: 'Abertas', em_andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluídas', cancelada: 'Canceladas' };
    return order.map((k) =>
      '<button class="fchip' + (st.status === k ? ' active' : '') + '" data-action="os:filter" data-status="' + k + '">' +
        labels[k] + '<span class="count">' + counts[k] + '</span>' +
      '</button>'
    ).join('');
  }

  views.ordens = {
    render() {
      const counts = countByStatus();
      const list = filtered();
      return '' +
        '<div class="page-head">' +
          '<div>' +
            '<h1>Ordens de Serviço <span class="badge">' + U.icon('orders', 14) + ' ' + counts.todas + ' no total</span></h1>' +
            '<p class="page-head__sub">Acompanhe, inicie e finalize os atendimentos.</p>' +
          '</div>' +
          '<div class="page-actions">' +
            '<button class="btn btn--filled" data-action="nav" data-route="nova">' + U.icon('plus') + ' Nova OS</button>' +
          '</div>' +
        '</div>' +

        '<div class="card filter-bar">' +
          '<div class="filter-bar__search">' + U.icon('search') +
            '<input type="text" placeholder="Buscar por nº, cliente ou produto…" data-input="os:search" value="' + U.esc(st.q) + '">' +
          '</div>' +
          '<select class="field-select" data-change="os:sort" title="Ordenar por">' +
            '<option value="recent"' + (st.sort === 'recent' ? ' selected' : '') + '>Mais recentes</option>' +
            '<option value="numero"' + (st.sort === 'numero' ? ' selected' : '') + '>Nº da OS</option>' +
            '<option value="valor"' + (st.sort === 'valor' ? ' selected' : '') + '>Maior valor</option>' +
            '<option value="cliente"' + (st.sort === 'cliente' ? ' selected' : '') + '>Cliente (A–Z)</option>' +
          '</select>' +
        '</div>' +

        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">' + chipRow(counts) + '</div>' +
        '<div id="osCount" style="font-size:.82rem;color:var(--text-3);margin-bottom:12px">' + list.length + ' OS encontrada' + (list.length === 1 ? '' : 's') + '</div>' +
        '<div id="osListWrap">' + (list.length ? tableHtml(list) : emptyHtml()) + '</div>' +

        '<button class="fab" data-action="nav" data-route="nova" title="Nova OS">' + U.icon('plus', 26) + '</button>';
    },
    mount() { /* listeners via delegação */ }
  };

  actions['os:filter'] = function (d) {
    st.status = d.status;
    App.reload();
  };
  actions['os:clear'] = function () {
    st.q = '';
    st.status = 'todas';
    App.reload();
  };
  inputs['os:search'] = function (el) {
    st.q = el.value;
    refreshList();
  };
  changes['os:sort'] = function (el) {
    st.sort = el.value;
    refreshList();
  };

  /* ============================================================
     DETALHE DA OS (acompanhamento)
     ============================================================ */

  function stepperHtml(os) {
    if (os.status === 'cancelada') {
      return '<div class="banner banner--danger">' + U.icon('warning') + '<span><strong>Ordem cancelada</strong> — ' + U.dateTime(os.historico[os.historico.length - 1].data) + '.</span></div>';
    }
    const idx = { aberta: 0, em_andamento: 1, aguardando: 1, concluida: 2 }[os.status];
    const steps = [
      { k: 'aberta', label: 'Aberta' },
      { k: 'em_andamento', label: 'Em andamento' },
      { k: 'concluida', label: 'Concluída' }
    ];
    return '<div class="stepper">' + steps.map((s, i) => {
      const cls = i < idx ? 'done' : (i === idx ? 'active' : '');
      const dot = i < idx ? U.icon('check', 16) : (i + 1);
      return '<div class="step ' + cls + '">' +
        '<div class="step__dot">' + dot + '</div>' +
        '<div class="step__label">' + s.label + (s.k === 'em_andamento' && os.status === 'aguardando' ? ' · pausada' : '') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function acoesHtml(os) {
    switch (os.status) {
      case 'aberta':
        return '<div class="btn-row">' +
          '<button class="btn btn--filled" data-action="os:advance" data-id="' + os.id + '" data-to="em_andamento">' + U.icon('play') + ' Iniciar atendimento</button>' +
          (App.auth.can('os:cancelar')
            ? '<button class="btn btn--outlined" data-action="os:advance" data-id="' + os.id + '" data-to="cancelada">' + U.icon('close') + ' Cancelar OS</button>'
            : '') +
        '</div>';
      case 'em_andamento':
        return '<div class="btn-row">' +
          '<button class="btn btn--outlined" data-action="os:advance" data-id="' + os.id + '" data-to="aguardando">' + U.icon('pause') + ' Aguardar peça</button>' +
          '<button class="btn btn--filled" data-action="os:advance" data-id="' + os.id + '" data-to="concluida">' + U.icon('check') + ' Finalizar OS</button>' +
        '</div>';
      case 'aguardando':
        return '<div class="banner banner--info">' + U.icon('info') + '<span>Ordem pausada aguardando peça de reposição.</span></div>' +
          '<div class="btn-row" style="margin-top:12px">' +
            '<button class="btn btn--tonal" data-action="os:advance" data-id="' + os.id + '" data-to="em_andamento">' + U.icon('play') + ' Retomar atendimento</button>' +
            '<button class="btn btn--filled" data-action="os:advance" data-id="' + os.id + '" data-to="concluida">' + U.icon('check') + ' Finalizar OS</button>' +
          '</div>';
      case 'concluida':
        return '<div class="banner banner--success">' + U.icon('check') + '<span><strong>Serviço concluído</strong> em ' + U.date(os.dataConclusao) + '.</span></div>' +
          '<button class="btn btn--text" style="margin-top:10px" data-action="os:advance" data-id="' + os.id + '" data-to="em_andamento">' + U.icon('restart') + ' Reabrir OS</button>';
      case 'cancelada':
        return '<button class="btn btn--filled" data-action="os:advance" data-id="' + os.id + '" data-to="aberta">' + U.icon('restart') + ' Reabrir OS</button>';
    }
    return '';
  }

  function historicoHtml(os) {
    const items = [...os.historico].sort((a, b) => b.data - a.data);
    return '<div class="timeline">' + items.map((h, i) =>
      '<div class="tl-item' + (i === 0 ? ' tl-item--current' : '') + '" style="--c:' + S.STATUS[h.status].cor + '">' +
        '<div class="tl-item__title">' + U.esc(h.titulo) + ' <span style="margin-left:auto">' + U.statusChip(h.status) + '</span></div>' +
        '<div class="tl-item__meta">' + U.icon('clock', 13) + ' ' + U.dateTime(h.data) + '</div>' +
        (h.nota ? '<div class="tl-item__note">' + U.esc(h.nota) + '</div>' : '') +
      '</div>'
    ).join('') + '</div>';
  }

  views.ordemDetail = {
    render(param) {
      const os = S.getOrdem(param);
      if (!os) {
        return '<div class="card"><div class="empty"><div class="empty__icon">' + U.icon('warning') + '</div><h3>Ordem não encontrada</h3><p>Ela pode ter sido excluída.</p><button class="btn btn--filled" data-action="nav" data-route="ordens">Voltar para ordens</button></div></div>';
      }
      const cli = S.getCliente(os.clienteId);
      const historico = [...os.historico].sort((a, b) => b.data - a.data);

      return '' +
        '<div class="page-head">' +
          '<div style="display:flex;gap:12px;align-items:flex-start">' +
            '<button class="icon-btn" data-action="nav" data-route="ordens" title="Voltar">' + U.icon('back') + '</button>' +
            '<div>' +
              '<h1>' + os.numero + ' ' + U.statusChip(os.status) + '</h1>' +
              '<p class="page-head__sub">Aberta em ' + U.dateTime(os.dataAbertura) + ' · ' + U.esc(cli ? cli.nome : '—') + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="page-actions">' +
            '<button class="btn btn--tonal" data-action="os:print" data-id="' + os.id + '">' + U.icon('print') + ' Imprimir</button>' +
            '<button class="btn btn--outlined" data-action="os:pdf" data-id="' + os.id + '">' + U.icon('download') + ' PDF</button>' +
            (App.auth.can('os:excluir')
              ? '<button class="icon-btn danger" data-action="os:delete" data-id="' + os.id + '" title="Excluir OS">' + U.icon('trash') + '</button>'
              : '') +
          '</div>' +
        '</div>' +

        '<div class="grid grid--2" style="align-items:start">' +
          '<div class="stack">' +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('bag') + ' Dados do serviço</div>' +
              '<div class="dl" style="margin-top:8px">' +
                '<div class="dl__row"><span class="lbl">' + U.icon('bag', 16) + ' Produto</span><span class="val">' + U.esc(os.equipamento) + '</span></div>' +
                '<div class="dl__row"><span class="lbl">Marca / Série</span><span class="val">' + U.esc(os.marca || '—') + (os.serie ? ' · ' + U.esc(os.serie) : '') + '</span></div>' +
                '<div class="dl__row"><span class="lbl">Prioridade</span><span class="val">' + U.priChip(os.prioridade) + '</span></div>' +
                '<div class="dl__row"><span class="lbl">' + U.icon('user', 16) + ' Técnico</span><span class="val">' + U.esc(os.tecnico) + '</span></div>' +
                '<div class="dl__row"><span class="lbl">' + U.icon('calendar', 16) + ' Prazo</span><span class="val">' + U.prazoPill(os) + '</span></div>' +
              '</div>' +
              '<div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--border)">' +
                '<div class="card__sub" style="margin-bottom:6px">Descrição do serviço</div>' +
                '<p style="font-size:.92rem;color:var(--text-2)">' + U.esc(os.descricao) + '</p>' +
              '</div>' +
              (os.observacoes ? '<div style="margin-top:14px"><div class="card__sub" style="margin-bottom:6px">Observações</div><p style="font-size:.88rem;color:var(--text-2)">' + U.esc(os.observacoes) + '</p></div>' : '') +
            '</div>' +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('trend') + ' Andamento</div>' +
              stepperHtml(os) +
              '<div style="margin-top:18px">' + acoesHtml(os) + '</div>' +
            '</div>' +              '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('note') + ' Histórico e anotações <span style="margin-left:auto;font-size:.8rem;color:var(--text-3)">' + historico.length + ' registro(s)</span></div>' +
              '<div class="field" style="margin-top:16px">' +
                '<label>Nova anotação</label>' +
                '<textarea id="osNota" rows="2" placeholder="Ex.: cliente aprovou orçamento, peça chegou, teste final ok…"></textarea>' +
                '<div style="display:flex;justify-content:flex-end"><button class="btn btn--filled btn--sm" data-action="os:addnote" data-id="' + os.id + '">' + U.icon('send', 15) + ' Adicionar anotação</button></div>' +
              '</div>' +
              historicoHtml(os) +
            '</div>' +

            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('download') + ' Documentos <span style="margin-left:auto;font-size:.8rem;color:var(--text-3)">' + (os.documentos || []).length + ' PDF(s)</span></div>' +
              (typeof App.docListHtml === 'function' ? App.docListHtml(os.documentos || [], 'os') : '') +
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
                '<div class="dl__row"><span class="lbl">Valor estimado</span><span class="val">' + (os.valorEstimado != null ? U.money(os.valorEstimado) : '—') + '</span></div>' +
                '<div class="dl__row"><span class="lbl">Valor final</span><span class="val text-primary fw-600">' + (os.valorFinal != null ? U.money(os.valorFinal) : '—') + '</span></div>' +
                '<div class="dl__row"><span class="lbl">Conclusão</span><span class="val">' + (os.dataConclusao ? U.date(os.dataConclusao) : '—') + '</span></div>' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</div>';
    },
    mount() { /* delegação */ }
  };

  /* ---------- ações compartilhadas (lista + detalhe) ---------- */

  let statusBusy = false;
  let noteBusy = false;

  function finalizarDialog(os) {
    U.dialog({
      title: 'Finalizar ' + os.numero,
      icon: 'check',
      body:
        '<div class="field"><label>Valor final (R$)</label>' +
        '<input id="dlgValor" type="number" step="0.01" min="0" value="' + (os.valorFinal != null ? os.valorFinal : (os.valorEstimado != null ? os.valorEstimado : '')) + '">' +
        '<div class="field__err">Informe um valor válido.</div></div>' +
        '<div class="field"><label>Observações / nota</label><textarea id="dlgNota" rows="3" placeholder="Ex.: teste final executado, entrega agendada…"></textarea></div>',
      actions: [
        { id: 'ok', label: 'Finalizar OS', kind: 'filled', icon: 'check' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'ok' || statusBusy) return;
        const v = parseFloat(document.getElementById('dlgValor').value);
        if (isNaN(v) || v < 0) {
          document.getElementById('dlgValor').closest('.field').classList.add('field--error');
          return false;
        }
        const nota = document.getElementById('dlgNota').value;
        statusBusy = true;
        return S.avancarStatus(os.id, 'concluida', nota, v)
          .then(() => {
            statusBusy = false;
            U.snackbar('OS ' + os.numero + ' concluída e faturada em ' + U.money(v), 'success');
            done();
            App.reload();
          })
          .catch((err) => { statusBusy = false; U.erro(err, 'Erro ao finalizar:'); });
      }
    });
  }

  function avancar(d) {
    if (statusBusy) return;
    const os = S.getOrdem(d.id);
    if (!os) return;
    const to = d.to;
    if (to === 'concluida') { finalizarDialog(os); return; }
    if (to === 'cancelada') {
      if (!App.auth.can('os:cancelar')) { U.snackbar('Apenas administradores podem cancelar ordens.', 'error'); return; }
      U.confirm({
        title: 'Cancelar ' + os.numero,
        message: 'A ordem será marcada como cancelada. Você pode reabri-la depois se necessário.',
        confirmLabel: 'Cancelar OS',
        danger: true
      }).then((ok) => {
        if (!ok) return;
        statusBusy = true;
        S.avancarStatus(os.id, 'cancelada', 'Ordem cancelada pelo operador.')
          .then(() => {
            statusBusy = false;
            U.snackbar('OS ' + os.numero + ' cancelada.', 'warn');
            App.reload();
          })
          .catch((err) => { statusBusy = false; U.erro(err, 'Erro ao cancelar:'); });
      });
      return;
    }
    statusBusy = true;
    S.avancarStatus(os.id, to, to === 'aguardando' ? 'Aguardando peça no fornecedor.' : '')
      .then(() => {
        statusBusy = false;
        U.snackbar('Status atualizado para ' + S.STATUS[to].label + '.', 'success');
        App.reload();
      })
      .catch((err) => { statusBusy = false; U.erro(err, 'Erro ao atualizar status:'); });
  }

  actions['os:advance'] = function (d) { avancar(d); };
  actions['os:addnote'] = function (d) {
    const ta = document.getElementById('osNota');
    if (!ta || !ta.value.trim()) {
      U.snackbar('Escreva uma anotação antes de adicionar.', 'warn');
      if (ta) ta.focus();
      return;
    }
    if (noteBusy) return;
    const nota = ta.value;
    noteBusy = true;
    S.addNota(d.id, nota)
      .then(() => {
        noteBusy = false;
        U.snackbar('Anotação adicionada ao histórico.', 'success');
        App.reload();
      })
      .catch((err) => { noteBusy = false; U.erro(err, 'Erro ao salvar anotação:'); });
  };
  actions['os:print'] = function (d) {
    const os = S.getOrdem(d.id);
    if (!os) return;
    U.printReport(App.buildOSReport(S.empresa(), os));
  };
  actions['os:pdf'] = function (d) {
    const os = S.getOrdem(d.id);
    if (!os) return;
    U.snackbar('Gerando PDF…', 'info');
    U.buildPdf(App.buildOSReport(S.empresa(), os))
      .then(({ pdf, base64 }) => {
        const nome = 'OS-' + os.numero + '.pdf';
        pdf.save(nome);
        // guarda uma cópia no histórico da OS (reimpressão posterior)
        return S.addDocumento('ordem', os.id, nome, base64)
          .then(() => U.snackbar('PDF gerado e salvo no histórico da OS.', 'success'))
          .catch(() => U.snackbar('PDF baixado (não foi possível salvá-lo no histórico).', 'warn'));
      })
      .catch((err) => U.erro(err, 'Erro ao gerar PDF:'));
  };
  actions['os:delete'] = function (d) {
    if (!App.auth.can('os:excluir')) { U.snackbar('Apenas administradores podem excluir ordens.', 'error'); return; }
    const os = S.getOrdem(d.id);
    if (!os) return;
    U.confirm({
      title: 'Excluir ' + os.numero,
      message: 'A ordem será removida permanentemente, incluindo todo o histórico. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir OS',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.removeOrdem(os.id)
        .then(() => {
          U.snackbar('OS ' + os.numero + ' excluída.', 'error');
          App.go('ordens');
        })
        .catch((err) => U.erro(err, 'Erro ao excluir:'));
    });
  };

  /* ============================================================
     NOVA OS (abrir ordem)
     ============================================================ */
  const nv = { pri: 'media', clienteId: '', produtoId: '' };

  function prodOpts() {
    const prods = S.produtos();
    let opts = '<option value="">Selecione o produto…</option>';
    if (!prods.length) opts += '<option value="">Nenhum produto cadastrado — clique em + para cadastrar.</option>';
    opts += prods.map((p) =>
      '<option value="' + p.id + '"' + (nv.produtoId === p.id ? ' selected' : '') + '>' +
        U.esc(p.nome) + (p.marca ? ' (' + U.esc(p.marca) + ')' : '') +
      '</option>'
    ).join('');
    return opts;
  }

  views.nova = {
    render() {
      const clientes = S.clientes();
      const opts = clientes.length
        ? clientes.map((c) => '<option value="' + c.id + '"' + (nv.clienteId === c.id ? ' selected' : '') + '>' + U.esc(c.nome) + '</option>').join('')
        : '<option value="">Nenhum cliente cadastrado</option>';

      return '' +
        '<div class="page-head">' +
          '<div style="display:flex;gap:12px;align-items:flex-start">' +
            '<button class="icon-btn" data-action="nav" data-route="ordens" title="Voltar">' + U.icon('back') + '</button>' +
            '<div>' +
              '<h1>Nova Ordem de Serviço</h1>' +
              '<p class="page-head__sub">Preencha os dados do atendimento. Campos com * são obrigatórios.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card card--pad">' +
          '<div class="form-grid">' +

            '<div class="field">' +
              '<label>Cliente *</label>' +
              '<div style="display:flex;gap:8px">' +
                '<select id="nvCliente" style="flex:1"><option value="">Selecione o cliente…</option>' + opts + '</select>' +
                '<button type="button" class="btn btn--tonal" data-action="cli:new" data-from="nova" title="Cadastrar novo cliente">' + U.icon('plus') + '</button>' +
              '</div>' +
              '<div class="field__err">Selecione ou cadastre um cliente.</div>' +
            '</div>' +

            '<div class="field">' +
              '<label>Técnico responsável</label>' +
              '<select id="nvTec">' + tecOptions() + '</select>' +
            '</div>' +

            '<div class="field">' +
              '<label>Produto *</label>' +
              '<div style="display:flex;gap:8px">' +
                '<select id="nvProd" style="flex:1" data-change="os:prod">' + prodOpts() + '</select>' +
                '<button type="button" class="btn btn--tonal" data-action="os:addprod" title="Cadastrar produto">' + U.icon('plus') + '</button>' +
              '</div>' +
              '<div class="field__err">Selecione ou cadastre um produto.</div>' +
            '</div>' +

            '<div class="field">' +
              '<label>Marca</label>' +
              '<input id="nvMarca" type="text" placeholder="Preenchida automaticamente pelo produto">' +
            '</div>' +

            '<div class="field">' +
              '<label>Nº de série</label>' +
              '<input id="nvSerie" type="text" placeholder="Ex.: SN-1234">' +
            '</div>' +

            '<div class="field">' +
              '<label>Valor estimado (R$)</label>' +
              '<input id="nvValor" type="number" step="0.01" min="0" placeholder="0,00">' +
            '</div>' +

            '<div class="field">' +
              '<label>Prazo de entrega</label>' +
              '<input id="nvPrazo" type="date">' +
            '</div>' +

            '<div class="field">' +
              '<label>Prioridade</label>' +
              '<div class="seg" id="nvPrior">' +
                '<button type="button" class="seg__opt' + (nv.pri === 'baixa' ? ' active' : '') + '" data-pri="baixa">Baixa</button>' +
                '<button type="button" class="seg__opt' + (nv.pri === 'media' ? ' active' : '') + '" data-pri="media">Média</button>' +
                '<button type="button" class="seg__opt' + (nv.pri === 'alta' ? ' active' : '') + '" data-pri="alta">Alta</button>' +
              '</div>' +
            '</div>' +

            '<div class="field span-2">' +
              '<label>Descrição do serviço *</label>' +
              '<textarea id="nvDesc" rows="3" placeholder="Descreva o problema relatado e o serviço a ser realizado…"></textarea>' +
              '<div class="field__err">Descreva o serviço a ser realizado.</div>' +
            '</div>' +

            '<div class="field span-2">' +
              '<label>Observações (opcional)</label>' +
              '<textarea id="nvObs" rows="2" placeholder="Observações gerais, condições de recebimento…"></textarea>' +
            '</div>' +

          '</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;border-top:1px solid var(--border);padding-top:18px">' +
            '<button class="btn btn--text" data-action="os:reset">Limpar</button>' +
            '<button class="btn btn--filled btn--lg" data-action="os:create">' + U.icon('check') + ' Abrir ordem de serviço</button>' +
          '</div>' +
        '</div>';
    },
    mount() {
      const prazo = document.getElementById('nvPrazo');
      if (prazo && !prazo.value) {
        prazo.value = U.dateStr(new Date(Date.now() + 7 * 86400000));
      }
      // preenche a marca a partir do produto selecionado (ex.: após cadastrar)
      const p = S.getProduto(nv.produtoId);
      const marca = document.getElementById('nvMarca');
      if (p && marca && !marca.value) marca.value = p.marca || '';
      // gancho usado pelo dialog de novo cliente (clientes.js)
      App.onClientCreated = () => {
        const clientes = S.clientes();
        nv.clienteId = clientes.length ? clientes[clientes.length - 1].id : '';
        App.reload();
      };
    }
  };

  changes['os:prod'] = function (el) {
    nv.produtoId = el.value;
    const p = S.getProduto(el.value);
    const marca = document.getElementById('nvMarca');
    if (marca) marca.value = p ? (p.marca || '') : '';
  };
  actions['os:addprod'] = function () {
    App.productDialog().then((p) => {
      if (!p) return;
      nv.produtoId = p.id;
      App.reload();
    });
  };

  actions['os:pri'] = function (d, e) {
    nv.pri = d.pri;
    const opt = e.target.closest('.seg__opt');
    const seg = opt ? opt.closest('.seg') : null;
    if (seg) seg.querySelectorAll('.seg__opt').forEach((b) => b.classList.toggle('active', b === opt));
  };
  actions['os:reset'] = function () {
    nv.pri = 'media'; nv.clienteId = '';
    App.reload();
    U.snackbar('Formulário limpo.', 'info');
  };
  actions['os:create'] = function () {
    const g = (id) => document.getElementById(id);
    const clienteId = g('nvCliente').value;
    const produto = S.getProduto(nv.produtoId);
    const equipamento = produto ? produto.nome : '';
    const descricao = g('nvDesc').value.trim();

    let ok = true;
    [['nvCliente', clienteId], ['nvProd', nv.produtoId], ['nvDesc', descricao]].forEach(([id, val]) => {
      const bad = !val;
      const f = g(id).closest('.field');
      f.classList.toggle('field--error', bad);
      if (bad) ok = false;
    });
    if (!ok) {
      U.snackbar('Preencha os campos obrigatórios antes de abrir a OS.', 'error');
      return;
    }

    const valor = parseFloat(g('nvValor').value);
    S.addOrdem({
      clienteId,
      equipamento,
      marca: g('nvMarca').value.trim() || (produto ? produto.marca : ''),
      serie: g('nvSerie').value.trim(),
      descricao,
      prioridade: nv.pri,
      valorEstimado: isNaN(valor) ? null : valor,
      prazo: g('nvPrazo').value,
      tecnico: g('nvTec').value,
      observacoes: g('nvObs').value.trim()
    })
      .then((os) => {
        U.snackbar('OS ' + os.numero + ' aberta com sucesso!', 'success');
        App.go('ordem/' + os.id);
      })
      .catch((err) => U.erro(err, 'Erro ao abrir a OS:'));
  };
})(window);
