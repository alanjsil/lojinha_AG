/* Lógica pura do app Compras (sem DOM): de-para, plano de envio e cliente Supabase.
   Roda no WebView (window.Core) e no Node (testes em tests/). */
(function (root) {
  "use strict";

  // mesmos valores aceitos por despesas_tipo_check (inclui "onibus" depois da migração 20261101025657)
  const TIPOS = [
    ["gasolina", "Gasolina"],
    ["alimentacao", "Alimentação"],
    ["pedagio", "Pedágio"],
    ["onibus", "Ônibus"],
    ["outros", "Outros"],
    ["aluguel", "Aluguel"],
    ["agua", "Água"],
    ["luz", "Luz"],
    ["internet", "Internet"],
  ];
  const LIMIAR = 0.6; // similaridade mínima para considerar "é o mesmo produto"
  const LIMIAR_DUPLICADO = 0.85; // novo produto parecido demais com um que já existe
  const MARKUP = 1.75; // preço de venda padrão da lojinha = custo × 1,75

  const round2 = (n) => Math.round((Number(n) || 0) * 100 + 1e-7) / 100;
  const num = (v) => {
    const x = parseFloat(String(v == null ? "" : v).replace(",", "."));
    return isFinite(x) ? x : 0;
  };
  const semAcento = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const custoUnit = (usd, dolar) => round2(num(usd) * num(dolar));

  // ---------- de-para (item do app × produto do catálogo) ----------
  const RUIDO = new Set(["perfume", "whisky", "edp", "edt", "de", "da", "do", "e"]);
  const ABREV = { perf: "perfume", per: "perfume", jd: "jack daniels", moleton: "moletom" };

  function tokens(nome) {
    const t = semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
    const out = [];
    for (const w of t) for (const x of (ABREV[w] || w).split(" ")) if (!RUIDO.has(x)) out.push(x);
    return out;
  }

  function similaridade(a, b) {
    const A = new Set(tokens(a));
    const B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let n = 0;
    for (const x of A) if (B.has(x)) n++;
    return Math.max((2 * n) / (A.size + B.size), 0.85 * (n / A.size));
  }

  function candidatos(nome, produtos) {
    return produtos
      .map((p) => ({ produto: p, score: similaridade(nome, p.nome) }))
      .sort((x, y) => y.score - x.score || x.produto.nome.localeCompare(y.produto.nome));
  }

  // estados: ok | novo | conferir (pid suspeito) | sugerido (sem pid, há sugestão) | sem (sem pid, sem sugestão)
  function avaliar(item, produtos) {
    const cands = candidatos(item.nome, produtos);
    const melhor = cands[0] && cands[0].score >= LIMIAR ? cands[0] : null;
    if (item.novo) return { estado: "novo", cands, melhor };
    const atual = item.pid ? produtos.find((p) => p.id === item.pid) : null;
    if (atual) {
      const score = similaridade(item.nome, atual.nome);
      if (item.vincOk === item.pid || score >= LIMIAR) return { estado: "ok", produto: atual, score, cands, melhor };
      return { estado: "conferir", motivo: "O vínculo parece ser de outro produto", produto: atual, score, cands, melhor };
    }
    if (melhor) return { estado: "sugerido", cands, melhor };
    return { estado: "sem", cands, melhor: null };
  }

  // "Perf Lattafa X" / "Per Lattafa X" -> "Perfume Lattafa X" (só o nome, sem tamanho nem EDP)
  function nomeNovo(nome) {
    return String(nome || "").trim().replace(/^(perf|per)\.?\s+/i, "Perfume ").replace(/\s+/g, " ");
  }

  function validarDespesa(d) {
    if (!TIPOS.some((t) => t[0] === d.tipo)) return "Escolha o tipo da despesa";
    if (!(num(d.valor) > 0)) return "Informe o valor";
    if (d.data && !/^\d{4}-\d{2}-\d{2}$/.test(d.data)) return "Data inválida";
    return null;
  }

  // ---------- plano de envio ----------
  function novoControle() {
    return { produtos: {}, compras: {}, despesas: {} };
  }

  function montarPlano(S, cat, sent) {
    sent = sent || novoControle();
    const produtos = (cat && cat.produtos) || [];
    const categorias = (cat && cat.categorias) || [];
    const dolar = num(S.config.dolar);
    const data = S.config.data;
    const catId = (nome) => {
      const k = semAcento(nome).toLowerCase();
      const c = categorias.find((x) => semAcento(x.nome).toLowerCase() === k);
      return c ? c.id : null;
    };
    const plano = {
      data, dolar,
      novos: [], compras: [], despesas: [], pendencias: [], avisos: [],
      total: { compras: 0, despesas: 0 },
    };
    const nomesNovos = new Set();

    for (const it of S.itens) {
      if (!it.comprado || !(num(it.qtdc) > 0)) continue;
      if (!(num(it.usd) > 0)) {
        plano.pendencias.push({ item: it, motivo: "Sem preço em US$" });
        continue;
      }
      const cu = custoUnit(it.usd, dolar);
      const qtd = num(it.qtdc);
      const av = avaliar(it, produtos);
      const linha = { itemId: it.id, nome: it.nome, quantidade: qtd, custo_unit: cu, total: round2(qtd * cu), enviado: !!sent.compras[it.id] };

      if (av.estado === "novo") {
        const categoria_id = catId(it.cat);
        if (!categoria_id) {
          plano.pendencias.push({ item: it, motivo: 'A categoria "' + it.cat + '" não existe no catálogo' });
          continue;
        }
        const nome = String((it.novo && it.novo.nome) || nomeNovo(it.nome)).trim();
        const chave = semAcento(nome).toLowerCase();
        if (!nome || nomesNovos.has(chave)) {
          plano.pendencias.push({ item: it, motivo: "Nome do produto novo vazio ou repetido" });
          continue;
        }
        const parecido = candidatos(nome, produtos)[0];
        if (parecido && parecido.score >= LIMIAR_DUPLICADO && !sent.produtos[it.id]) {
          plano.pendencias.push({ item: it, motivo: 'Já existe "' + parecido.produto.nome + '". Vincule a ele em vez de criar.' });
          continue;
        }
        if (parecido && parecido.score >= LIMIAR && parecido.score < LIMIAR_DUPLICADO && !sent.produtos[it.id]) {
          plano.avisos.push('"' + nome + '" lembra "' + parecido.produto.nome + '" (já existe). Confira antes de criar.');
        }
        nomesNovos.add(chave);
        const preco = it.novo && num(it.novo.preco) > 0 ? round2(it.novo.preco) : round2(cu * MARKUP);
        plano.novos.push({ itemId: it.id, nome, categoria: it.cat, categoria_id, custo: cu, preco, enviado: !!sent.produtos[it.id] });
        plano.compras.push({ ...linha, pid: null, produto: nome + " (novo)" });
      } else if (av.estado === "ok") {
        const precoAtual = num(av.produto.preco);
        if (precoAtual > 0 && cu > precoAtual) {
          plano.avisos.push(it.nome + ": custo R$ " + cu.toFixed(2) + " acima do preço de venda atual (R$ " + precoAtual.toFixed(2) + ")");
        }
        plano.compras.push({ ...linha, pid: av.produto.id, produto: av.produto.nome });
      } else {
        const motivo =
          av.estado === "conferir" ? av.motivo + ' (hoje: "' + av.produto.nome + '")'
          : av.estado === "sugerido" ? 'Confirme o produto sugerido: "' + av.melhor.produto.nome + '"'
          : "Escolha o produto ou crie um novo";
        plano.pendencias.push({ item: it, motivo });
      }
    }

    for (const d of S.despesas || []) {
      const erro = validarDespesa(d);
      if (erro) {
        plano.pendencias.push({ despesa: d, motivo: erro });
        continue;
      }
      plano.despesas.push({
        id: d.id, data: d.data || data, tipo: d.tipo, descricao: (d.descricao || "").trim() || null,
        valor: round2(d.valor), enviado: !!sent.despesas[d.id],
      });
    }

    plano.total.compras = round2(plano.compras.reduce((s, c) => s + c.total, 0));
    plano.total.despesas = round2(plano.despesas.reduce((s, d) => s + d.valor, 0));
    plano.total.geral = round2(plano.total.compras + plano.total.despesas);
    plano.aEnviar = {
      novos: plano.novos.filter((n) => !n.enviado).length,
      compras: plano.compras.filter((c) => !c.enviado).length,
      despesas: plano.despesas.filter((d) => !d.enviado).length,
    };
    return plano;
  }

  // ---------- cliente Supabase (Auth + PostgREST), sem biblioteca ----------
  function erroApi(r) {
    const j = r.json || {};
    const msg = j.message || j.msg || j.error_description || (typeof j.error === "string" ? j.error : "") || (r.text || "").slice(0, 120) || "Erro " + r.status;
    if (j.code === "23514") return new Error("O banco recusou o valor (regra de validação). Se for o tipo Ônibus, falta aplicar a migração neste ambiente.");
    if (j.code === "23505") return new Error("Já existe um registro igual: " + msg);
    if (j.code === "42501" || /row-level security|permission denied/i.test(msg)) return new Error("Sem permissão: só o gerente grava neste ambiente.");
    if (r.status === 401) return new Error("Sessão inválida. Entre de novo.");
    return new Error(msg);
  }

  function criarCliente(cfg) {
    if (!cfg || !cfg.url || !cfg.key) throw new Error("Ambiente sem URL ou chave configurada");
    const base = String(cfg.url).replace(/\/+$/, "");
    let sess = cfg.load ? cfg.load() : null;

    async function req(method, path, opt) {
      opt = opt || {};
      const h = { apikey: cfg.key, Authorization: "Bearer " + (opt.token || cfg.key), "Content-Type": "application/json" };
      if (opt.prefer) h.Prefer = opt.prefer;
      const r = await cfg.http(method, base + path, h, opt.body ? JSON.stringify(opt.body) : undefined);
      let json = null;
      try { json = r.text ? JSON.parse(r.text) : null; } catch (e) { /* corpo não é JSON */ }
      return { status: r.status, json, text: r.text };
    }
    function guardar(j) {
      sess = {
        access: j.access_token, refresh: j.refresh_token,
        exp: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
        email: (j.user && j.user.email) || (sess && sess.email) || "",
      };
      if (cfg.save) cfg.save(sess);
      return sess;
    }
    async function login(email, senha) {
      const r = await req("POST", "/auth/v1/token?grant_type=password", { body: { email: String(email).trim(), password: senha } });
      if (r.status !== 200) {
        const j = r.json || {};
        if (j.error_code === "invalid_credentials" || r.status === 400) throw new Error("E-mail ou senha incorretos.");
        throw erroApi(r);
      }
      return guardar(r.json);
    }
    function sair() { sess = null; if (cfg.save) cfg.save(null); }
    async function token() {
      if (!sess) throw new Error("Entre com seu e-mail e senha.");
      if (sess.exp - 60 > Date.now() / 1000) return sess.access;
      const r = await req("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: sess.refresh } });
      if (r.status !== 200) { sair(); throw new Error("A sessão expirou. Entre de novo."); }
      return guardar(r.json).access;
    }
    async function api(method, path, body, prefer) {
      const t = await token();
      const r = await req(method, "/rest/v1" + path, { body, token: t, prefer });
      if (r.status >= 300) throw erroApi(r);
      return r.json;
    }
    async function inserir(tabela, linha) {
      const rows = await api("POST", "/" + tabela, linha, "return=representation");
      const id = rows && rows[0] && rows[0].id;
      if (!id) throw new Error("O banco não devolveu o id de " + tabela);
      return id;
    }
    async function catalogo() {
      const categorias = await api("GET", "/categorias?select=id,nome,ordem,ativo&order=ordem");
      const produtos = await api("GET", "/produtos?select=id,nome,custo,preco,categoria_id&ativo=eq.true&order=nome&limit=1000");
      return { em: Date.now(), categorias: categorias.filter((c) => c.ativo !== false), produtos };
    }
    async function despesasRecentes(limite) {
      return api("GET", "/despesas?select=id,data,tipo,descricao,valor&order=data.desc,created_at.desc&limit=" + (limite || 30));
    }
    async function comprasDoDia(data) {
      return api("GET", "/compras?select=produto_id,quantidade,custo_unit&data=eq." + encodeURIComponent(data));
    }
    return { login, sair, api, inserir, catalogo, despesasRecentes, comprasDoDia, sessao: () => sess };
  }

  // Envia na ordem: despesas -> produtos novos -> compras. As despesas vao primeiro porque e nelas que um ambiente
  // sem a migracao "onibus" recusa o valor: assim a falha acontece ANTES de gravar produtos e compras.
  // Cada sucesso e gravado em `sent` (persistido por hooks.persist), entao repetir depois de uma falha nao duplica nada.
  async function enviar(cli, plano, sent, hooks) {
    const log = (m) => hooks && hooks.log && hooks.log(m);
    const salvar = () => hooks && hooks.persist && hooks.persist();
    const res = { produtos: 0, compras: 0, despesas: 0 };
    if (plano.pendencias.length) throw new Error("H\u00e1 pend\u00eancias no de-para. Resolva antes de enviar.");

    for (const d of plano.despesas) {
      if (sent.despesas[d.id]) continue;
      log("Despesa: " + (d.descricao || d.tipo));
      sent.despesas[d.id] = await cli.inserir("despesas", { data: d.data, tipo: d.tipo, descricao: d.descricao, valor: d.valor });
      res.despesas++;
      salvar();
    }
    for (const n of plano.novos) {
      if (sent.produtos[n.itemId]) continue;
      log("Criando produto: " + n.nome);
      sent.produtos[n.itemId] = await cli.inserir("produtos", { nome: n.nome, categoria_id: n.categoria_id, custo: n.custo, preco: n.preco });
      res.produtos++;
      salvar();
    }
    for (const c of plano.compras) {
      if (sent.compras[c.itemId]) continue;
      const pid = c.pid || sent.produtos[c.itemId];
      if (!pid) throw new Error("O produto novo de " + c.nome + " ainda n\u00e3o foi criado.");
      log("Compra: " + c.nome);
      sent.compras[c.itemId] = await cli.inserir("compras", { data: plano.data, produto_id: pid, quantidade: c.quantidade, custo_unit: c.custo_unit });
      res.compras++;
      salvar();
    }
    return res;
  }

  const Core = {
    TIPOS, LIMIAR, MARKUP, round2, num, semAcento, custoUnit, tokens, similaridade, candidatos, avaliar,
    nomeNovo, validarDespesa, novoControle, montarPlano, criarCliente, enviar,
  };
  root.Core = Core;
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
})(typeof window !== "undefined" ? window : globalThis);
