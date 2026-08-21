/* ============================================================
   TechFix OS — Componentes de UI (ícones, formatadores,
   dialogs, snackbar, impressão)
   ============================================================ */
(function (global) {
  'use strict';

  const App = global.App;
  const S = App.store;

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.6"/><rect x="14" y="12" width="7" height="9" rx="1.6"/><rect x="3" y="16" width="7" height="5" rx="1.6"/>',
    orders: '<path d="M9 4h6a1 1 0 0 1 1 1v1h1.5A1.5 1.5 0 0 1 19 7.5v11A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-11A1.5 1.5 0 0 1 6.5 6H8V5a1 1 0 0 1 1-1z"/><path d="M9 4v2h6V4"/><path d="M9 13l2 2 4-4"/>',
    clients: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.9"/><path d="M17.5 14.2a5.5 5.5 0 0 1 3 5.8"/>',
    reports: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    print: '<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    check: '<path d="M5 13l4 4L19 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10h.01M18 10h.01"/>',
    phone: '<path d="M6 3h3l1.5 4.5L8 9.5a12 12 0 0 0 6.5 6.5l2-2.5L21 15v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
    warning: '<path d="M12 3l10 18H2z"/><path d="M12 9v5M12 17.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    wrench: '<path d="M14.2 5.8a4.6 4.6 0 0 0-6 5.9L3.5 16.4 7.6 20.5l4.7-4.7a4.6 4.6 0 0 0 5.9-6l-3 3-3.3-.8-.8-3.3z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2.3M12 19.7V22M2 12h2.3M19.7 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.8"/><path d="M3 4v5h5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    note: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    bag: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9.5 12l2 2 3.5-3.5"/>',
    key: '<circle cx="8" cy="15" r="4.2"/><path d="M11 12l8-8M15 8l2.5 2.5M13 10l2 2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M3.5 3.5l17 17"/><path d="M10.6 5.1A9.5 9.5 0 0 1 12 5c6 0 9.5 7 9.5 7a16.5 16.5 0 0 1-2.3 3M6.2 6.2A16.7 16.7 0 0 0 2.5 12S6 19 12 19a9.3 9.3 0 0 0 4.6-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    receipt: '<path d="M5 3h14v18l-2.5-1.7L14 21l-2-1.8L10 21l-2.5-1.7L5 21z"/><path d="M9 8h6M9 12h6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const U = {
    icon(name, size) {
      const s = size || 20;
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.info) + '</svg>';
    },
    esc,
    money(v) {
      const n = Number(v) || 0;
      return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    date(ts) {
      return ts ? new Date(ts).toLocaleDateString('pt-BR') : '—';
    },
    dateTime(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
    longDate(ts) {
      const s = new Date(ts).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
    dateStr(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    },
    today() { return this.dateStr(new Date()); },
    monthStartStr() {
      const d = new Date();
      return this.dateStr(new Date(d.getFullYear(), d.getMonth(), 1));
    },
    initials(name) {
      return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    },
    avatar(name, cls) {
      return '<div class="avatar' + (cls ? ' ' + cls : '') + '">' + esc(this.initials(name)) + '</div>';
    },
    statusChip(status) {
      const m = S.STATUS[status];
      return '<span class="chip chip--status" style="--c:' + m.cor + '">' + m.label + '</span>';
    },
    priChip(p) {
      const m = S.PRIORIDADE[p] || S.PRIORIDADE.media;
      return '<span class="chip chip--status" style="--c:' + m.cor + '">' + m.label + '</span>';
    },
    prazoPill(os) {
      if (!os.prazo) return '<span class="muted">Sem prazo definido</span>';
      const vencido = os.prazo < Date.now() && !['concluida', 'cancelada'].includes(os.status);
      if (vencido) return '<span class="chip chip--status" style="--c:#ff6b6b">Prazo vencido · ' + this.date(os.prazo) + '</span>';
      return '<span class="muted">Prazo: ' + this.date(os.prazo) + '</span>';
    },

    /* ---------- Dialog ---------- */
    dialog(opts) {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        const actions = opts.actions && opts.actions.length ? opts.actions : [{ id: 'close', label: 'Fechar', kind: 'text' }];
        const kindClass = { filled: 'btn--filled', tonal: 'btn--tonal', outlined: 'btn--outlined', text: 'btn--text', danger: 'btn--danger' };
        const actsHtml = actions.map((a) =>
          '<button class="btn ' + (kindClass[a.kind] || 'btn--filled') + '" data-act="' + a.id + '">' + (a.icon ? U.icon(a.icon) + ' ' : '') + esc(a.label) + '</button>'
        ).join('');
        overlay.innerHTML =
          '<div class="dialog' + (opts.size ? ' dialog--' + opts.size : '') + '">' +
            (opts.title ? '<div class="dialog__head">' + (opts.icon ? '<div class="dialog__icon">' + U.icon(opts.icon) + '</div>' : '') + '<div class="dialog__title">' + esc(opts.title) + '</div><button class="icon-btn dialog__close" data-act="close" title="Fechar">' + U.icon('close') + '</button></div>' : '') +
            '<div class="dialog__body">' + (opts.body || '<p class="dialog__msg">' + esc(opts.message || '') + '</p>') + '</div>' +
            '<div class="dialog__foot">' + actsHtml + '</div>' +
          '</div>';
        document.getElementById('dialogRoot').appendChild(overlay);
        if (opts.mount) opts.mount(overlay);

        let done = false;
        function close(res) {
          if (done) return;
          done = true;
          overlay.classList.remove('open');
          overlay.style.pointerEvents = 'none';
          setTimeout(() => overlay.remove(), 220);
          resolve(res);
        }

        requestAnimationFrame(() => overlay.classList.add('open'));

        overlay.addEventListener('click', (e) => {
          const t = e.target.closest('[data-act]');
          if (t) {
            const id = t.dataset.act;
            if (opts.actionHandler) {
              // actionHandler pode ser síncrono (undefined/false) ou assíncrono
              // (retorna Promise e fecha via done() quando concluir).
              const r = opts.actionHandler(id, () => close(id));
              if (r && typeof r.then === 'function') { r.catch(() => {}); return; }
              if (r === false) return;
            }
            close(id);
          } else if (e.target === overlay && opts.dismissable !== false) {
            close('close');
          }
        });
        overlay.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && opts.dismissable !== false) close('close');
        });
        setTimeout(() => {
          const el = overlay.querySelector('[autofocus]') || overlay.querySelector('input, textarea, select') || overlay.querySelector('button[data-act]');
          if (el) el.focus();
        }, 80);
      });
    },

    confirm(opts) {
      return this.dialog({
        title: opts.title || 'Confirmação',
        icon: opts.icon || 'warning',
        message: opts.message || 'Deseja continuar?',
        actions: [
          { id: 'ok', label: opts.confirmLabel || 'Confirmar', kind: opts.danger ? 'danger' : 'filled', icon: 'check' },
          { id: 'close', label: 'Cancelar', kind: 'text' }
        ],
        dismissable: true
      }).then((id) => id === 'ok');
    },

    /* ---------- Snackbar ---------- */
    snackbar(msg, kind) {
      const wrap = document.getElementById('snackbarRoot');
      const el = document.createElement('div');
      el.className = 'snack' + (kind ? ' snack--' + kind : '');
      const icons = { success: 'check', error: 'warning', warn: 'warning', info: 'info' };
      el.innerHTML = (icons[kind] ? '<span class="snack__icon">' + U.icon(icons[kind]) + '</span>' : '') + '<span>' + esc(msg) + '</span>';
      wrap.appendChild(el);
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 280);
      }, 3600);
    },

    /* ---------- Erros de rede/API ---------- */
    erro(err, prefix) {
      if (err && err.silent) return; // 401 de sessão expirada já redirecionou ao login
      U.snackbar(prefix + ' ' + ((err && err.msg) || 'Falha na operação.'), 'error');
    },

    /* ---------- Impressão de relatórios ---------- */
    printReport(html) {
      const root = document.getElementById('printRoot');
      root.innerHTML = html;
      document.body.classList.add('printing');
      const after = () => {
        document.body.classList.remove('printing');
        root.innerHTML = '';
        window.removeEventListener('afterprint', after);
      };
      window.addEventListener('afterprint', after);
      setTimeout(() => {
        try { window.print(); } catch (e) { /* preview sem print */ }
        setTimeout(after, 800);
      }, 120);
    },

    /* ---------- Exportar PDF (jsPDF + html2canvas, sem print dialog) ---------- */
    pdfReady: null,
    loadPdfLibs() {
      if (this.pdfReady) return this.pdfReady;
      const inject = (src) => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = res;
        s.onerror = () => rej(new Error('Falha ao carregar a biblioteca de PDF (' + src + ').'));
        document.head.appendChild(s);
      });
      this.pdfReady = Promise.all([
        inject('js/vendor/html2canvas.min.js'),
        inject('js/vendor/jspdf.umd.min.js')
      ]);
      return this.pdfReady;
    },
    /* Renderiza o relatório e devolve { pdf, base64 } — permite baixar e,
       se quiser, guardar uma cópia no histórico (base64 sem o prefixo data:). */
    async buildPdf(html) {
      await this.loadPdfLibs();
      // stage fora da tela (precisa estar renderizado para o html2canvas capturar)
      let stage = document.getElementById('pdfStage');
      if (!stage) {
        stage = document.createElement('div');
        stage.id = 'pdfStage';
        document.body.appendChild(stage);
      }
      stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;z-index:-1;';
      stage.innerHTML = html;
      const canvas = await window.html2canvas(stage, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      stage.innerHTML = '';
      const PDF = window.jspdf && window.jspdf.jsPDF;
      if (!PDF) throw new Error('Biblioteca de PDF indisponível.');
      const pdf = new PDF('p', 'mm', 'a4');
      const pageW = 210, pageH = 297, margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      // JPEG de alta qualidade: fração do tamanho do PNG (importante para
      // armazenar os PDFs no histórico), com texto nítido graças ao scale 2.
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      let heightLeft = imgH;
      let position = margin;
      pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;
      while (heightLeft > 0) {
        position = heightLeft - imgH + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
        heightLeft -= pageH - margin * 2;
      }
      return { pdf, base64: pdf.output('datauristring').split(',')[1] };
    },
    async pdfReport(html, filename) {
      const { pdf } = await this.buildPdf(html);
      pdf.save(filename);
    }
  };

  App.ui = U;
})(window);
