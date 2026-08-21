/* ============================================================
   TechFix OS — Dashboard
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App, U = App.ui, S = App.store;
  const views = (App.views = App.views || {});

  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  views.dashboard = {
    render() {
      const ordens = S.ordens();
      const now = new Date();
      const iniMes = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

      const cont = (st) => ordens.filter((o) => o.status === st).length;
      const total = ordens.length;
      const abertas = cont('aberta');
      const emAndamento = cont('em_andamento');
      const aguardando = cont('aguardando');
      const ativas = abertas + emAndamento + aguardando;

      const conclMes = ordens.filter((o) => o.status === 'concluida' && o.dataConclusao >= iniMes && o.dataConclusao < fimMes);
      const fatMes = conclMes.reduce((s, o) => s + (o.valorFinal || 0), 0);
      const atrasadas = ordens.filter((o) => ['aberta', 'em_andamento', 'aguardando'].includes(o.status) && o.prazo && o.prazo < now.getTime()).length;

      const recentes = [...ordens].sort((a, b) => b.dataAbertura - a.dataAbertura).slice(0, 5);

      const statBars = ['aberta', 'em_andamento', 'aguardando', 'concluida', 'cancelada']
        .filter((k) => cont(k) > 0)
        .map((k) => {
          const pct = total ? Math.round((cont(k) / total) * 100) : 0;
          return '<div class="bar">' +
            '<div class="bar__head"><span>' + S.STATUS[k].label + ' <b>' + cont(k) + '</b></span><span>' + pct + '%</span></div>' +
            '<div class="progress"><div data-w="' + pct + '" style="--c:' + S.STATUS[k].cor + '"></div></div>' +
          '</div>';
        }).join('');

      const kpi = (icon, value, fmt, label, trend) =>
        '<div class="card kpi">' +
          '<div class="kpi__icon">' + U.icon(icon) + '</div>' +
          '<div class="kpi__value"><span class="countup" data-count="' + value + '" data-format="' + fmt + '">0</span></div>' +
          '<div class="kpi__label">' + label + '</div>' +
          (trend ? '<div class="kpi__trend">' + U.icon('trend', 14) + trend + '</div>' : '') +
        '</div>';

      const me = App.auth.current();
      const primeiroNome = me ? String(me.nome).split(' ')[0] : 'usuário';

      return '' +
        '<div class="page-head">' +
          '<div>' +
            '<h1>' + saudacao() + ', ' + U.esc(primeiroNome) + ' <span class="muted fw-600">👋</span></h1>' +
            '<p class="page-head__sub">' + U.longDate(Date.now()) + ' · ' + ativas + ' ordem(ns) em aberto</p>' +
          '</div>' +
          '<div class="page-actions">' +
            '<button class="btn btn--tonal" data-action="nav" data-route="relatorios">' + U.icon('reports') + ' Relatórios</button>' +
            '<button class="btn btn--filled" data-action="nav" data-route="nova">' + U.icon('plus') + ' Nova OS</button>' +
          '</div>' +
        '</div>' +

        '<div class="grid grid--kpi">' +
          kpi('orders', total, 'int', 'Total de ordens', ativas + ' ativas agora') +
          kpi('clock', emAndamento, 'int', 'Em andamento', aguardando + ' aguardando peça') +
          kpi('check', conclMes.length, 'int', 'Concluídas no mês', 'mês vigente') +
          kpi('money', fatMes, 'money', 'Faturamento no mês', conclMes.length + ' OS faturadas') +
        '</div>' +

        (atrasadas > 0
          ? '<div class="banner banner--danger" style="margin-top:20px">' + U.icon('warning') + '<span><strong>' + atrasadas + ' ordem(ns)</strong> com prazo vencido. Acesse a OS para redefinir o prazo ou concluir o atendimento.</span></div>'
          : '') +

        '<div class="grid grid--2" style="margin-top:20px; align-items:start">' +
          '<div class="card card--pad">' +
            '<div class="card__title">' + U.icon('clock') + ' OS recentes</div>' +
            '<div class="card__sub">Últimas ordens de serviço abertas</div>' +
            '<div style="margin-top:16px">' +
              (recentes.length ? recentes.map((os) => App.osRow(os)).join('') : '<div class="empty"><div class="empty__icon">' + U.icon('orders') + '</div><h3>Nenhuma ordem ainda</h3><p>Crie a primeira ordem de serviço para começar.</p><button class="btn btn--filled" data-action="nav" data-route="nova">' + U.icon('plus') + ' Abrir OS</button></div>') +
            '</div>' +
          '</div>' +
          '<div class="stack">' +
            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('chart') + ' Status das ordens</div>' +
              '<div class="bars">' + (statBars || '<p class="muted">Sem ordens cadastradas.</p>') + '</div>' +
            '</div>' +
            '<div class="card card--pad">' +
              '<div class="card__title">' + U.icon('bag') + ' Ações rápidas</div>' +
              '<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">' +
                '<button class="btn btn--tonal" data-action="nav" data-route="nova">' + U.icon('plus') + ' Abrir nova OS</button>' +
                '<button class="btn btn--outlined" data-action="nav" data-route="orcform">' + U.icon('receipt') + ' Criar orçamento</button>' +
                '<button class="btn btn--outlined" data-action="nav" data-route="ordens">' + U.icon('orders') + ' Acompanhar ordens</button>' +
                '<button class="btn btn--outlined" data-action="nav" data-route="clientes">' + U.icon('clients') + ' Gerenciar clientes</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    },

    mount() {
      requestAnimationFrame(() => {
        document.querySelectorAll('.progress > div[data-w]').forEach((b) => {
          b.style.width = b.dataset.w + '%';
        });
        document.querySelectorAll('.countup[data-count]').forEach((el) => {
          const target = parseFloat(el.dataset.count);
          const fmt = el.dataset.format;
          const t0 = performance.now();
          const dur = 900;
          function tick(t) {
            const p = Math.min(1, (t - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            const v = Math.round(target * eased);
            el.textContent = fmt === 'money' ? U.money(v) : v.toLocaleString('pt-BR');
            if (p < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      });
    }
  };
})(window);
