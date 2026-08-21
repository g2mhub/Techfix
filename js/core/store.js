/* ============================================================
   TechFix OS — Camada de dados (API backend + cache em memória)
   Os getters continuam síncronos (a UI não muda); as mutações
   vão ao servidor (Flask/SQLite) e re-hidratam o cache.
   ============================================================ */
(function (global) {
  'use strict';

  if (!global.App) global.App = {};
  const App = global.App;

  const STATUS = {
    aberta:       { label: 'Aberta',          cor: '#5aa7ff', next: ['em_andamento', 'cancelada'] },
    em_andamento: { label: 'Em andamento',    cor: '#ff8c00', next: ['aguardando', 'concluida'] },
    aguardando:   { label: 'Aguardando peça', cor: '#b388ff', next: ['em_andamento', 'concluida'] },
    concluida:    { label: 'Concluída',       cor: '#57c98a', next: ['em_andamento'] },
    cancelada:    { label: 'Cancelada',       cor: '#8b8b96', next: ['aberta'] }
  };

  const PRIORIDADE = {
    baixa: { label: 'Baixa', cor: '#57c98a' },
    media: { label: 'Média', cor: '#ffb84d' },
    alta:  { label: 'Alta',  cor: '#ff6b6b' }
  };

  const ORC_STATUS = {
    aberto:   { label: 'Aberto',   cor: '#5aa7ff' },
    aprovado: { label: 'Aprovado', cor: '#57c98a' },
    recusado: { label: 'Recusado', cor: '#ff6b6b' }
  };

  /* ---------- cliente HTTP ---------- */
  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)techfix_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function api(path, opts) {
    opts = opts || {};
    const method = opts.method || 'GET';
    const headers = { 'Content-Type': 'application/json' };
    if (method !== 'GET') {
      // CSRF double-submit: cookie legível pelo JS + header na requisição
      const tok = csrfToken();
      if (tok) headers['X-CSRF-Token'] = tok;
    }
    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        credentials: 'same-origin'
      });
    } catch (e) {
      const err = new Error('Não foi possível conectar ao servidor. Verifique se o backend está ativo.');
      err.msg = err.message;
      err.network = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* sem corpo */ }
    if (!res.ok) {
      const err = new Error((data && data.erro) || 'Falha na requisição (' + res.status + ').');
      err.status = res.status;
      err.msg = err.message;
      if (res.status === 401) {
        err.silent = true; // sessão expirada: o redirect ao login já comunica
        // o endpoint de login trata o 401 como credenciais inválidas (não redireciona)
        if (path !== '/api/auth/login' && typeof App.handleUnauthorized === 'function') {
          try { App.handleUnauthorized(); } catch (e2) { /* ignora */ }
        }
      }
      throw err;
    }
    return data;
  }
  App.api = api;

  /* ---------- cache (hidratado pelo servidor) ---------- */
  let cache = {
    empresa: null, clientes: [], ordens: [], tecnicos: [],
    produtos: [], orcamentos: [], orcModelo: { obsPadrao: '', rodape: '', campos: [] }
  };

  const Store = {
    STATUS,
    PRIORIDADE,
    ORC_STATUS,

    clientes: () => cache.clientes,
    ordens: () => cache.ordens,
    empresa: () => cache.empresa,
    tecnicos: () => cache.tecnicos,
    produtos: () => cache.produtos,
    orcamentos: () => cache.orcamentos,
    orcModelo: () => cache.orcModelo,
    getCliente: (id) => cache.clientes.find((c) => c.id === id) || null,
    getOrdem: (id) => cache.ordens.find((o) => o.id === id) || null,
    getProduto: (id) => cache.produtos.find((p) => p.id === id) || null,
    getOrcamento: (id) => cache.orcamentos.find((o) => o.id === id) || null,
    ordensDeCliente: (id) => cache.ordens.filter((o) => o.clienteId === id),
    orcamentosDeCliente: (id) => cache.orcamentos.filter((o) => o.clienteId === id),

    async hydrate() {
      const data = await api('/api/bootstrap');
      cache = {
        empresa: data.empresa || cache.empresa,
        clientes: data.clientes || [],
        ordens: data.ordens || [],
        tecnicos: data.tecnicos || [],
        produtos: data.produtos || [],
        orcamentos: data.orcamentos || [],
        orcModelo: data.orcModelo || cache.orcModelo
      };
      return cache;
    },

    async setEmpresa(e) {
      // a resposta é a fonte da verdade (ex.: logo vira flag; o arquivo é servido via GET)
      const emp = await api('/api/empresa', { method: 'PUT', body: e });
      cache.empresa = Object.assign({}, cache.empresa, emp);
      return emp;
    },

    async addCliente(d) {
      const c = await api('/api/clientes', { method: 'POST', body: d });
      await this.hydrate();
      return c;
    },
    async updateCliente(id, d) {
      const c = await api('/api/clientes/' + encodeURIComponent(id), { method: 'PATCH', body: d });
      await this.hydrate();
      return c;
    },
    async removeCliente(id) {
      try {
        await api('/api/clientes/' + encodeURIComponent(id), { method: 'DELETE' });
      } catch (e) {
        if (e.status === 409 || e.status === 400) return { ok: false, msg: e.msg };
        throw e;
      }
      await this.hydrate();
      return { ok: true };
    },

    async addOrdem(d) {
      const os = await api('/api/ordens', { method: 'POST', body: d });
      await this.hydrate();
      return os;
    },
    async removeOrdem(id) {
      await api('/api/ordens/' + encodeURIComponent(id), { method: 'DELETE' });
      await this.hydrate();
    },
    async addNota(osId, nota) {
      await api('/api/ordens/' + encodeURIComponent(osId) + '/nota', { method: 'POST', body: { nota } });
      await this.hydrate();
    },
    async avancarStatus(osId, novo, nota, valorFinal) {
      await api('/api/ordens/' + encodeURIComponent(osId) + '/status', {
        method: 'POST',
        body: { novo, nota: nota || '', valorFinal: valorFinal === undefined ? null : valorFinal }
      });
      await this.hydrate();
    },

    /* ---------- produtos (catálogo) ---------- */
    async addProduto(d) {
      const p = await api('/api/produtos', { method: 'POST', body: d });
      await this.hydrate();
      return p;
    },
    async updateProduto(id, d) {
      const p = await api('/api/produtos/' + encodeURIComponent(id), { method: 'PATCH', body: d });
      await this.hydrate();
      return p;
    },
    async removeProduto(id) {
      await api('/api/produtos/' + encodeURIComponent(id), { method: 'DELETE' });
      await this.hydrate();
    },

    /* ---------- orçamentos ---------- */
    async addOrcamento(d) {
      const o = await api('/api/orcamentos', { method: 'POST', body: d });
      await this.hydrate();
      return o;
    },
    async updateOrcamento(id, d) {
      const o = await api('/api/orcamentos/' + encodeURIComponent(id), { method: 'PATCH', body: d });
      await this.hydrate();
      return o;
    },
    async removeOrcamento(id) {
      await api('/api/orcamentos/' + encodeURIComponent(id), { method: 'DELETE' });
      await this.hydrate();
    },
    async avancarOrcStatus(id, novo) {
      await api('/api/orcamentos/' + encodeURIComponent(id) + '/status', {
        method: 'POST',
        body: { novo }
      });
      await this.hydrate();
    },
    async setOrcModelo(d) {
      const m = await api('/api/config/orc-modelo', { method: 'PUT', body: d });
      await this.hydrate();
      return m;
    },

    /* ---------- documentos (PDFs salvos no histórico) ---------- */
    async addDocumento(entidade, entidadeId, nome, base64) {
      const plural = entidade === 'ordem' ? 'ordens' : 'orcamentos';
      await api('/api/' + plural + '/' + encodeURIComponent(entidadeId) + '/documentos', {
        method: 'POST',
        body: { nome, base64 }
      });
      await this.hydrate();
    },
    async removeDocumento(docId) {
      await api('/api/documentos/' + encodeURIComponent(docId), { method: 'DELETE' });
      await this.hydrate();
    }
  };

  App.store = Store;
})(window);
