/* ============================================================
   TechFix OS — Relatórios (gerar + imprimir)
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui, S = App.store;
  const views = (App.views = App.views || {});
  const actions = (App.actions = App.actions || {});
  const changes = (App.changes = App.changes || {});

  const rep = { de: U.monthStartStr(), ate: U.today(), selId: '' };

  /* ---------- construtores de HTML de relatório (imprimir) ---------- */

  function logoHtml(emp) {
    if (emp.logo) {
      return '<div class="report__logo report__logo--img"><img src="/api/empresa/logo" alt="Logo da empresa"></div>';
    }
    return '<div class="report__logo">TF</div>';
  }

  /* Lê a imagem selecionada e devolve uma data URL com até `maxBytes`
     (redimensiona via canvas e re-encode JPEG em qualidade decrescente). */
  function resizeLogo(file, maxBytes) {
    maxBytes = maxBytes || 1024 * 1024;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        const maxDim = 1024;
        if (w > maxDim || h > maxDim) {
          const s = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        let out = cv.toDataURL('image/png');
        let q = 0.92;
        while (out.length > maxBytes && q > 0.25) {
          out = cv.toDataURL('image/jpeg', q);
          q -= 0.12;
        }
        if (out.length > maxBytes) {
          reject(new Error('A imagem ficou muito grande mesmo após redimensionar (máx. 1 MB).'));
        } else {
          resolve(out);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem. Tente outro arquivo.')); };
      img.src = url;
    });
  }

  function headHtml(emp) {
    return '<div class="report__head">' +
      '<div style="display:flex;gap:14px;align-items:center">' +
        logoHtml(emp) +
        '<div>' +
          '<h1>' + U.esc(emp.nome) + '</h1>' +
          '<p>CNPJ ' + U.esc(emp.cnpj) + ' · ' + U.esc(emp.endereco) + ' · ' + U.esc(emp.telefone) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="report__meta">Gerado em<br>' + U.dateTime(Date.now()) + '</div>' +
    '</div>';
  }

  function footHtml() {
    return '<p class="report__foot">Documento gerado pelo TechFix OS em ' + U.dateTime(Date.now()) + ' — informações sujeitas a conferência pelo técnico responsável.</p>';
  }

  // cabeçalho/rodapé compartilhados com a impressão de orçamentos (orcamentos.js)
  App.reportHead = headHtml;
  App.reportFoot = footHtml;

  App.buildOSReport = function (emp, os) {
    const cli = S.getCliente(os.clienteId);
    const hist = [...os.historico].sort((a, b) => a.data - b.data)
      .map((h) => '<li><strong>' + U.esc(h.titulo) + '</strong> <span class="sub">· ' + U.dateTime(h.data) + '</span>' + (h.nota ? '<br><span class="sub">' + U.esc(h.nota) + '</span>' : '') + '</li>')
      .join('');
    return '<div class="report">' +
      headHtml(emp) +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">' +
        '<div>' +
          '<h2 class="report__title">Ordem de Serviço</h2>' +
          '<p class="report__period">Aberta em ' + U.dateTime(os.dataAbertura) + '</p>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div class="report__osnum">' + os.numero + '</div>' +
          '<span class="report__status">' + S.STATUS[os.status].label + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="report__grid">' +
        '<div class="report__block"><h4>Cliente</h4>' +
          '<div><strong>' + U.esc(cli ? cli.nome : '—') + '</strong></div>' +
          (cli && cli.telefone ? '<div>' + U.esc(cli.telefone) + '</div>' : '') +
          (cli && cli.email ? '<div>' + U.esc(cli.email) + '</div>' : '') +
          (cli && cli.endereco ? '<div>' + U.esc(cli.endereco) + '</div>' : '') +
        '</div>' +
        '<div class="report__block"><h4>Produto</h4>' +
          '<div><strong>' + U.esc(os.equipamento) + '</strong></div>' +
          '<div class="sub">' + (os.marca ? 'Marca: ' + U.esc(os.marca) : '') + (os.serie ? ' · Série: ' + U.esc(os.serie) : '') + '</div>' +
          '<div class="sub">Prioridade: ' + (S.PRIORIDADE[os.prioridade] || {}).label + ' · Técnico: ' + U.esc(os.tecnico) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="report__block"><h4>Descrição do serviço</h4><div>' + U.esc(os.descricao) + '</div></div>' +
      (os.observacoes ? '<div class="report__block"><h4>Observações</h4><div>' + U.esc(os.observacoes) + '</div></div>' : '') +
      '<div class="report__block"><h4>Histórico</h4><ul class="hist">' + (hist || '<li>Sem registros.</li>') + '</ul></div>' +
      '<div class="report__totals">' +
        '<div><span>Valor estimado</span><b>' + (os.valorEstimado != null ? U.money(os.valorEstimado) : '—') + '</b></div>' +
        '<div><span>Valor final</span><b>' + (os.valorFinal != null ? U.money(os.valorFinal) : '—') + '</b></div>' +
        '<div><span>Prazo</span><b>' + (os.prazo ? U.date(os.prazo) : '—') + '</b></div>' +
        '<div><span>Conclusão</span><b>' + (os.dataConclusao ? U.date(os.dataConclusao) : '—') + '</b></div>' +
      '</div>' +
      '<div class="report__sign">' +
        '<div><div class="line">Cliente / Responsável</div></div>' +
        '<div><div class="line">Técnico responsável</div></div>' +
      '</div>' +
      footHtml() +
    '</div>';
  };

  App.buildPeriodReport = function (emp, deStr, ateStr, lista, tot) {
    const rows = lista.map((o) => {
      const cli = S.getCliente(o.clienteId);
      const val = o.valorFinal != null ? o.valorFinal : o.valorEstimado;
      return '<tr>' +
        '<td>' + o.numero + '</td>' +
        '<td>' + U.esc(cli ? cli.nome : '—') + '</td>' +
        '<td>' + U.esc(o.equipamento) + '</td>' +
        '<td>' + S.STATUS[o.status].label + '</td>' +
        '<td>' + U.date(o.dataAbertura) + '</td>' +
        '<td class="num">' + (val != null ? U.money(val) : '—') + '</td>' +
      '</tr>';
    }).join('');
    const fmt = (s) => String(s).split('-').reverse().join('/');
    return '<div class="report">' +
      headHtml(emp) +
      '<h2 class="report__title">Relatório de Ordens de Serviço</h2>' +
      '<p class="report__period">Período: ' + fmt(deStr) + ' a ' + fmt(ateStr) + ' · Total de OS: ' + lista.length + '</p>' +
      '<table>' +
        '<thead><tr><th>Nº OS</th><th>Cliente</th><th>Produto</th><th>Status</th><th>Abertura</th><th class="num">Valor</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="6" style="text-align:center">Nenhuma OS no período.</td></tr>') + '</tbody>' +
      '</table>' +
      '<div class="report__totals">' +
        '<div><span>Total de OS</span><b>' + tot.total + '</b></div>' +
        '<div><span>Concluídas</span><b>' + tot.concluidas + '</b></div>' +
        '<div><span>Canceladas</span><b>' + tot.canceladas + '</b></div>' +
        '<div><span>Faturamento</span><b>' + U.money(tot.faturamento) + '</b></div>' +
        '<div><span>Ticket médio</span><b>' + U.money(tot.ticket) + '</b></div>' +
      '</div>' +
      '<div class="report__sign">' +
        '<div><div class="line">Responsável</div></div>' +
        '<div><div class="line">Solicitante</div></div>' +
      '</div>' +
      footHtml() +
    '</div>';
  };

  /* ---------- helpers ---------- */

  function periodList() {
    const deT = new Date(rep.de + 'T00:00:00').getTime();
    const ateT = new Date(rep.ate + 'T23:59:59').getTime();
    return S.ordens().filter((o) => o.dataAbertura >= deT && o.dataAbertura <= ateT).sort((a, b) => a.dataAbertura - b.dataAbertura);
  }

  function totalsOf(lista) {
    const concluidas = lista.filter((o) => o.status === 'concluida');
    const canceladas = lista.filter((o) => o.status === 'cancelada');
    const faturamento = concluidas.reduce((s, o) => s + (o.valorFinal || 0), 0);
    return {
      total: lista.length,
      concluidas: concluidas.length,
      canceladas: canceladas.length,
      faturamento,
      ticket: concluidas.length ? faturamento / concluidas.length : 0
    };
  }

  function renderResult() {
    const box = document.getElementById('repResult');
    if (!box) return;
    if (!rep.de || !rep.ate) { box.innerHTML = ''; return; }
    const lista = periodList();
    const tot = totalsOf(lista);
    const rows = lista.map((o) => {
      const cli = S.getCliente(o.clienteId);
      const val = o.valorFinal != null ? o.valorFinal : o.valorEstimado;
      return '<tr data-action="open-ordem" data-id="' + o.id + '">' +
        '<td><div class="table__cell-main">' + o.numero + '</div></td>' +
        '<td>' + U.esc(cli ? cli.nome : '—') + '</td>' +
        '<td class="hide-sm">' + U.esc(o.equipamento) + '</td>' +
        '<td>' + U.statusChip(o.status) + '</td>' +
        '<td class="num">' + (val != null ? U.money(val) : '—') + '</td>' +
      '</tr>';
    }).join('');
    box.innerHTML =
      '<div class="card" style="overflow:hidden">' +          '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border)">' +
          '<div style="font-weight:600">Resultado · ' + lista.length + ' OS no período</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn--filled btn--sm" data-action="rep:printperiod">' + U.icon('print', 15) + ' Imprimir</button>' +
            '<button class="btn btn--outlined btn--sm" data-action="rep:pdfperiod">' + U.icon('download', 15) + ' PDF</button>' +
          '</div>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="table" style="min-width:640px">' +
            '<thead><tr><th>Nº OS</th><th>Cliente</th><th class="hide-sm">Produto</th><th>Status</th><th class="num">Valor</th></tr></thead>' +
            '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;padding:28px">Nenhuma OS no período selecionado.</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div style="display:flex;gap:26px;flex-wrap:wrap;padding:16px 18px;border-top:1px solid var(--border)">' +
          '<div><span class="muted" style="font-size:.75rem">Faturamento</span><div style="font-weight:700;font-size:1.1rem;color:var(--primary)">' + U.money(tot.faturamento) + '</div></div>' +
          '<div><span class="muted" style="font-size:.75rem">Concluídas</span><div style="font-weight:700">' + tot.concluidas + '</div></div>' +
          '<div><span class="muted" style="font-size:.75rem">Canceladas</span><div style="font-weight:700">' + tot.canceladas + '</div></div>' +
          '<div><span class="muted" style="font-size:.75rem">Ticket médio</span><div style="font-weight:700">' + U.money(tot.ticket) + '</div></div>' +
        '</div>' +
      '</div>';
  }

  /* ---------- view ---------- */

  views.relatorios = {
    render() {
      const emp = S.empresa();
      const now = new Date();
      const iniMes = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      const mes = S.ordens().filter((o) => o.status === 'concluida' && o.dataConclusao >= iniMes && o.dataConclusao < fimMes);
      const fatMes = mes.reduce((s, o) => s + (o.valorFinal || 0), 0);
      const ordens = [...S.ordens()].sort((a, b) => b.numero.localeCompare(a.numero));
      const opts = ordens.map((o) => {
        const cli = S.getCliente(o.clienteId);
        return '<option value="' + o.id + '"' + (rep.selId === o.id ? ' selected' : '') + '>' + o.numero + ' · ' + U.esc(cli ? cli.nome : '—') + ' · ' + U.esc(o.equipamento) + '</option>';
      }).join('');

      return '' +
        '<div class="page-head">' +
          '<div>' +
            '<h1>Relatórios</h1>' +
            '<p class="page-head__sub">Gere relatórios individuais ou por período e imprima diretamente.</p>' +
          '</div>' +
          '<div class="page-actions">' +
            (App.auth.can('rep:empresa')
              ? '<button class="btn btn--outlined" data-action="rep:empresa">' + U.icon('gear') + ' Dados da empresa</button>'
              : '') +
          '</div>' +
        '</div>' +

        '<div class="grid grid--3">' +
          '<div class="card kpi"><div class="kpi__icon">' + U.icon('money') + '</div><div class="kpi__value">' + U.money(fatMes) + '</div><div class="kpi__label">Faturamento no mês</div></div>' +
          '<div class="card kpi"><div class="kpi__icon">' + U.icon('check') + '</div><div class="kpi__value">' + mes.length + '</div><div class="kpi__label">OS concluídas no mês</div></div>' +
          '<div class="card kpi"><div class="kpi__icon">' + U.icon('chart') + '</div><div class="kpi__value">' + U.money(mes.length ? fatMes / mes.length : 0) + '</div><div class="kpi__label">Ticket médio</div></div>' +
        '</div>' +

        '<div class="grid grid--2" style="margin-top:20px;align-items:start">' +

          '<div class="card card--pad">' +
            '<div class="card__title">' + U.icon('print') + ' Relatório individual</div>' +
            '<div class="card__sub">Imprime a OS completa com histórico, valores e assinaturas.</div>' +
            '<div class="field" style="margin-top:16px">' +
              '<label>Selecione a ordem de serviço</label>' +
              '<select data-change="rep:sel"><option value="">Selecione…</option>' + opts + '</select>' +
            '</div>' +
            '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
              '<button class="btn btn--filled" data-action="rep:print">' + U.icon('print') + ' Imprimir relatório</button>' +
              '<button class="btn btn--outlined" data-action="rep:pdf">' + U.icon('download') + ' Baixar PDF</button>' +
            '</div>' +
          '</div>' +

          '<div class="card card--pad">' +
            '<div class="card__title">' + U.icon('calendar') + ' Relatório por período</div>' +
            '<div class="card__sub">Lista todas as OS abertas entre as datas escolhidas.</div>' +
            '<div class="grid grid--2-1" style="margin-top:16px">' +
              '<div class="field"><label>De</label><input type="date" id="repDe" value="' + rep.de + '" data-change="rep:de"></div>' +
              '<div class="field"><label>Até</label><input type="date" id="repAte" value="' + rep.ate + '" data-change="rep:ate"></div>' +
            '</div>' +
            '<div style="display:flex;gap:10px;margin-top:16px">' +
              '<button class="btn btn--tonal" data-action="rep:gen">' + U.icon('chart') + ' Gerar relatório</button>' +
            '</div>' +
            '<div id="repResult" class="result-box"></div>' +
          '</div>' +

        '</div>' +

        '<div class="card card--pad" style="margin-top:20px">' +
          '<div class="card__title">' + U.icon('info') + ' Cabeçalho dos relatórios</div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center">' +
            (emp.logo ? '<img class="emp-thumb" src="/api/empresa/logo" alt="Logotipo">' : '') +
            '<span style="font-weight:600">' + U.esc(emp.nome) + '</span>' +
            '<span class="muted" style="font-size:.85rem">· ' + U.esc(emp.cnpj) + ' · ' + U.esc(emp.endereco) + ' · ' + U.esc(emp.telefone) + '</span>' +
            (App.auth.can('rep:empresa')
              ? '<button class="btn btn--text btn--sm" data-action="rep:empresa" style="margin-left:auto">' + U.icon('edit', 15) + ' Editar</button>'
              : '') +
          '</div>' +
        '</div>';
    },
    mount() {
      App.onClientCreated = null;
      if (rep.selId) {
        const sel = document.querySelector('[data-change="rep:sel"]');
        if (sel) sel.value = rep.selId;
      }
      renderResult();
    }
  };

  /* ---------- ações ---------- */

  changes['rep:sel'] = function (el) { rep.selId = el.value; };
  changes['rep:de'] = function (el) { rep.de = el.value; renderResult(); };
  changes['rep:ate'] = function (el) { rep.ate = el.value; renderResult(); };

  actions['rep:gen'] = function () {
    if (!rep.de || !rep.ate) { U.snackbar('Informe o período para gerar o relatório.', 'warn'); return; }
    if (new Date(rep.de) > new Date(rep.ate)) { U.snackbar('A data inicial deve ser anterior à data final.', 'error'); return; }
    renderResult();
    U.snackbar('Relatório gerado para o período selecionado.', 'success');
  };

  actions['rep:print'] = function () {
    const os = S.getOrdem(rep.selId);
    if (!os) { U.snackbar('Selecione uma ordem de serviço para imprimir.', 'warn'); return; }
    U.printReport(App.buildOSReport(S.empresa(), os));
  };

  actions['rep:printperiod'] = function () {
    if (!rep.de || !rep.ate) return;
    const lista = periodList();
    if (!lista.length) { U.snackbar('Nenhuma OS no período para imprimir.', 'warn'); return; }
    U.printReport(App.buildPeriodReport(S.empresa(), rep.de, rep.ate, lista, totalsOf(lista)));
  };

  actions['rep:pdf'] = function () {
    const os = S.getOrdem(rep.selId);
    if (!os) { U.snackbar('Selecione uma ordem de serviço para baixar o PDF.', 'warn'); return; }
    U.snackbar('Gerando PDF…', 'info');
    U.pdfReport(App.buildOSReport(S.empresa(), os), 'OS-' + os.numero + '.pdf')
      .then(() => U.snackbar('PDF gerado: OS-' + os.numero + '.pdf', 'success'))
      .catch((err) => U.erro(err, 'Erro ao gerar PDF:'));
  };

  actions['rep:pdfperiod'] = function () {
    if (!rep.de || !rep.ate) return;
    const lista = periodList();
    if (!lista.length) { U.snackbar('Nenhuma OS no período para gerar PDF.', 'warn'); return; }
    const nome = 'Relatorio-' + rep.de + '-a-' + rep.ate + '.pdf';
    U.snackbar('Gerando PDF…', 'info');
    U.pdfReport(App.buildPeriodReport(S.empresa(), rep.de, rep.ate, lista, totalsOf(lista)), nome)
      .then(() => U.snackbar('PDF gerado: ' + nome, 'success'))
      .catch((err) => U.erro(err, 'Erro ao gerar PDF:'));
  };

  actions['rep:empresa'] = function () {
    if (!App.auth.can('rep:empresa')) { U.snackbar('Apenas administradores podem editar os dados da empresa.', 'error'); return; }
    const emp = S.empresa();
    let logoVal = '';          // nova data URL (ou '' para remover) — só enviada se mudou
    let logoChanged = false;
    U.dialog({
      title: 'Dados da empresa',
      icon: 'gear',
      size: 'lg',
      body:
        '<div class="field"><label>Razão social</label><input id="empNome" value="' + U.esc(emp.nome) + '"></div>' +
        '<div class="grid grid--2-1" style="margin-top:16px">' +
          '<div class="field"><label>CNPJ</label><input id="empCnpj" value="' + U.esc(emp.cnpj) + '"></div>' +
          '<div class="field"><label>Telefone</label><input id="empTel" value="' + U.esc(emp.telefone) + '"></div>' +
        '</div>' +
        '<div class="field" style="margin-top:16px"><label>Endereço</label><input id="empEnd" value="' + U.esc(emp.endereco) + '"></div>' +
        '<div class="field" style="margin-top:18px">' +
          '<label>Logotipo</label>' +
          '<div class="emp-logo-row">' +
            '<div class="emp-logo-prev" id="empLogoPrev">' + (emp.logo ? '<img src="/api/empresa/logo" alt="Logotipo">' : '<span>Sem logo</span>') + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px">' +
              '<label class="btn btn--outlined btn--sm" style="cursor:pointer;width:fit-content">' + U.icon('upload', 15) + ' Enviar logo<input type="file" id="empLogoFile" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none"></label>' +
              '<button type="button" class="btn btn--text btn--sm" id="empLogoRemove" style="width:fit-content">' + U.icon('trash', 14) + ' Remover logo</button>' +
            '</div>' +
          '</div>' +
          '<p class="field__help">PNG, JPG, GIF ou WebP · máximo 1 MB · imagens grandes são redimensionadas automaticamente. A logo aparece no cabeçalho dos relatórios e na sidebar.</p>' +
        '</div>',
      mount(overlay) {
        const file = overlay.querySelector('#empLogoFile');
        const prev = overlay.querySelector('#empLogoPrev');
        const removeBtn = overlay.querySelector('#empLogoRemove');
        if (file) file.addEventListener('change', () => {
          const f = file.files && file.files[0];
          if (!f) return;
          if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) {
            U.snackbar('Formato não suportado: use PNG, JPG, GIF ou WebP.', 'error');
            file.value = '';
            return;
          }
          resizeLogo(f).then((dataUrl) => {
            logoVal = dataUrl;
            logoChanged = true;
            if (prev) prev.innerHTML = '<img src="' + U.esc(logoVal) + '" alt="Logotipo">';
          }).catch((err) => {
            U.snackbar(err.message, 'error');
            file.value = '';
          });
        });
        if (removeBtn) removeBtn.addEventListener('click', () => {
          logoVal = '';
          logoChanged = true;
          if (file) file.value = '';
          if (prev) prev.innerHTML = '<span>Sem logo</span>';
        });
      },
      actions: [
        { id: 'save', label: 'Salvar', kind: 'filled', icon: 'check' },
        { id: 'close', label: 'Cancelar', kind: 'text' }
      ],
      actionHandler(id, done) {
        if (id !== 'save') return;
        const nome = document.getElementById('empNome').value.trim();
        if (!nome) {
          document.getElementById('empNome').closest('.field').classList.add('field--error');
          return false;
        }
        const payload = {
          nome,
          cnpj: document.getElementById('empCnpj').value.trim(),
          telefone: document.getElementById('empTel').value.trim(),
          endereco: document.getElementById('empEnd').value.trim()
        };
        if (logoChanged) payload.logo = logoVal;
        return S.setEmpresa(payload)
          .then(() => {
            U.snackbar('Dados da empresa atualizados.', 'success');
            done();
            App.reload();
          })
          .catch((err) => U.erro(err, 'Erro ao salvar:'));
      }
    });
  };
})(window);
