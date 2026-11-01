"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../web/core.js");
const catalogo = require("./fixtures/catalogo.json");
const viagem = require("./fixtures/viagem.json");

const clone = (o) => JSON.parse(JSON.stringify(o));
const porNome = (it) => viagem.itens.find((i) => i.nome === it);
const pidDe = (parte) => catalogo.produtos.find((p) => p.nome.includes(parte)).id;

test("custo unitário arredonda em centavos como a lojinha grava", () => {
  assert.equal(Core.custoUnit(16.8, 4.98), 83.66);
  assert.equal(Core.custoUnit(6.4224, 4.98), 31.98);
  assert.equal(Core.custoUnit(4.817, 4.98), 23.99);
  assert.equal(Core.custoUnit(24.855, 4.98), 123.78);
  assert.equal(Core.custoUnit("39", "4,98"), 194.22);
});

test("nome do produto novo: só expande Perf/Per, sem tamanho", () => {
  assert.equal(Core.nomeNovo("Per Lattafa Berry on Top"), "Perfume Lattafa Berry on Top");
  assert.equal(Core.nomeNovo("Perf Lattafa Al Oud Black"), "Perfume Lattafa Al Oud Black");
  assert.equal(Core.nomeNovo("Tenis"), "Tenis");
});

test("similaridade: abreviações do app batem com o catálogo", () => {
  const s = Core.similaridade;
  assert.ok(s("JD Apple 1L", "Whisky Jack Daniels Apple 1L") >= Core.LIMIAR);
  assert.ok(s("Johnnie Walker Red 1L", "Whisky Johnnie Walker Red Label 1L") >= Core.LIMIAR);
  assert.ok(s("Milka Hazelnuts 250g", "Milka Choco Whole Hazelnuts 250g") >= Core.LIMIAR);
  assert.ok(s("Milka Toffee 300g", "Milka Toffee & Wholenuts 300g") >= Core.LIMIAR);
  assert.ok(s("Perf Paris Corner Qissa", "Perfume Paris Corner Qissa 100ml EDP") >= Core.LIMIAR);
  assert.ok(s("Jarra Eletrica Vidro", "Jarra Elétrica Vidro") >= Core.LIMIAR);
  assert.ok(s("Moleton Preto", "Moletom") >= Core.LIMIAR);
});

test("similaridade: perfumes diferentes da mesma marca NÃO se confundem", () => {
  const s = Core.similaridade;
  assert.ok(s("Perf Lattafa Al Oud Black", "Perfume Armaf") < Core.LIMIAR);
  assert.ok(s("Perf Lattafa Mohra", "Perfume Lattafa Ansaam Gold 100ml EDP") < Core.LIMIAR);
  assert.ok(s("Perf Paris Corner Qissa", "Perfume Khamraha Preto") < Core.LIMIAR);
  assert.ok(s("Perf Lattafa Al Oud Black", "Perfume Lattafa Maahir Black 100ml EDP") < Core.LIMIAR);
});

test("de-para da viagem: vínculos trocados pelo renomear são detectados", () => {
  const est = (nome) => Core.avaliar(porNome(nome), catalogo.produtos);
  for (const n of ["JD Apple 1L", "JD Fire 1L", "JD Honey 1L", "Johnnie Walker Red 1L", "Jarra Eletrica Vidro",
    "Alfajor X6 Black Fusion", "Milka Choco Biscuit 300g", "Milka Hazelnuts 250g", "Milka Toffee 300g", "Milka Triolade 280g"]) {
    assert.equal(est(n).estado, "ok", n);
  }
  for (const n of ["Perf Lattafa Al Oud Black", "Perf Paris Corner Qissa", "Perf Lattafa Mohra"]) {
    assert.equal(est(n).estado, "conferir", n);
  }
  // o Qissa tem o produto certo no catálogo e o app o sugere
  assert.equal(est("Perf Paris Corner Qissa").melhor.produto.id, pidDe("Paris Corner Qissa"));
  for (const n of ["Per Lattafa Berry on Top", "Per Lattafa Mallow Madness", "Perf Lattafa Cookie Crave"]) {
    assert.equal(est(n).estado, "sem", n);
  }
});

test("moletons caem no Moletom (sugestão, sem pid)", () => {
  const it = { nome: "Moleton Colorido", pid: null };
  const av = Core.avaliar(it, catalogo.produtos);
  assert.equal(av.estado, "sugerido");
  assert.equal(av.melhor.produto.nome, "Moletom");
});

test("plano bloqueia envio enquanto o de-para tem pendências", () => {
  const S = clone(viagem);
  const plano = Core.montarPlano(S, catalogo, Core.novoControle());
  assert.equal(plano.pendencias.filter((p) => p.item).length, 6);
  assert.equal(plano.compras.length, 10);
  assert.equal(plano.novos.length, 0);
});

function resolvido() {
  const S = clone(viagem);
  const qissa = S.itens.find((i) => i.nome === "Perf Paris Corner Qissa");
  qissa.pid = pidDe("Paris Corner Qissa");
  qissa.vincOk = qissa.pid;
  for (const n of ["Perf Lattafa Al Oud Black", "Perf Lattafa Mohra", "Per Lattafa Berry on Top", "Per Lattafa Mallow Madness", "Perf Lattafa Cookie Crave"]) {
    const it = S.itens.find((i) => i.nome === n);
    it.pid = null;
    it.novo = { nome: Core.nomeNovo(n), preco: null };
  }
  return S;
}

test("plano resolvido: 5 produtos novos, 16 compras, totais da viagem", () => {
  const plano = Core.montarPlano(resolvido(), catalogo, Core.novoControle());
  assert.deepEqual(plano.pendencias, []);
  assert.equal(plano.novos.length, 5);
  assert.deepEqual(plano.novos.map((n) => n.nome), [
    "Perfume Lattafa Al Oud Black", "Perfume Lattafa Mohra", "Perfume Lattafa Berry on Top",
    "Perfume Lattafa Mallow Madness", "Perfume Lattafa Cookie Crave",
  ]);
  assert.deepEqual(plano.novos.map((n) => n.custo), [94.97, 74.2, 124, 123.78, 123.78]);
  assert.deepEqual(plano.novos.map((n) => n.preco), [166.2, 129.85, 217, 216.62, 216.62]);
  assert.ok(plano.novos.every((n) => n.categoria_id === catalogo.categorias.find((c) => c.nome === "Perfumes").id));
  assert.equal(plano.compras.length, 16);
  assert.equal(plano.total.compras, 2100.79);
  assert.equal(plano.total.despesas, 485.97);
  assert.equal(plano.total.geral, 2586.76);
  assert.deepEqual(plano.aEnviar, { novos: 5, compras: 16, despesas: 6 });
});

test("plano avisa custo acima do preço de venda (Alfajor e Qissa)", () => {
  const plano = Core.montarPlano(resolvido(), catalogo, Core.novoControle());
  assert.equal(plano.avisos.length, 2);
  assert.ok(plano.avisos.some((a) => a.startsWith("Alfajor")));
  assert.ok(plano.avisos.some((a) => a.startsWith("Perf Paris Corner Qissa")));
});

test("produto novo parecido demais com um existente é bloqueado (anti-duplicação)", () => {
  const S = resolvido();
  const it = S.itens.find((i) => i.nome === "Perf Lattafa Mohra");
  it.novo = { nome: "Perfume Lattafa Ansaam Gold", preco: null };
  const plano = Core.montarPlano(S, catalogo, Core.novoControle());
  assert.equal(plano.pendencias.length, 1);
  assert.match(plano.pendencias[0].motivo, /Já existe/);
});

test("despesa inválida vira pendência", () => {
  const S = resolvido();
  S.despesas.push({ id: "x", tipo: "transporte", valor: 10 });
  S.despesas.push({ id: "y", tipo: "onibus", valor: 0 });
  const plano = Core.montarPlano(S, catalogo, Core.novoControle());
  assert.equal(plano.pendencias.length, 2);
  assert.equal(plano.despesas.length, 6);
});

// ---------- cliente + envio contra um servidor falso ----------
function servidorFalso(opts) {
  opts = opts || {};
  const db = { produtos: [], compras: [], despesas: [] };
  const chamadas = [];
  let n = 0;
  const falhas = { ...(opts.falhas || {}) }; // { compras: 3 } = falha na 3ª inserção
  const cont = { produtos: 0, compras: 0, despesas: 0 };
  const resp = (status, obj) => ({ status, text: JSON.stringify(obj) });
  async function http(method, url, headers, body) {
    chamadas.push({ method, url, headers });
    const u = new URL(url);
    if (u.pathname === "/auth/v1/token") {
      const b = JSON.parse(body);
      if (u.searchParams.get("grant_type") === "password") {
        if (b.email === "gerente@teste" && b.password === "certa") {
          return resp(200, { access_token: "tok1", refresh_token: "ref1", expires_in: 3600, user: { email: b.email } });
        }
        return resp(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return resp(200, { access_token: "tok2", refresh_token: "ref2", expires_in: 3600, user: { email: "gerente@teste" } });
    }
    if (headers.Authorization === "Bearer " + opts.key) return resp(401, { message: "sem sessão" });
    if (method === "GET" && u.pathname === "/rest/v1/categorias") return resp(200, catalogo.categorias);
    if (method === "GET" && u.pathname === "/rest/v1/produtos") return resp(200, catalogo.produtos);
    if (method === "POST") {
      const tabela = u.pathname.split("/").pop();
      cont[tabela]++;
      if (falhas[tabela] === cont[tabela]) return resp(503, { message: "queda de rede simulada" });
      const row = { id: "novo-" + ++n, ...JSON.parse(body) };
      db[tabela].push(row);
      return resp(201, [row]);
    }
    return resp(404, { message: "rota desconhecida " + u.pathname });
  }
  return { http, db, chamadas };
}

function clienteDe(srv, extra) {
  let guardada = null;
  const cli = Core.criarCliente({
    url: "http://pi.local:8000", key: "ANON", http: srv.http,
    load: () => guardada, save: (s) => { guardada = s; }, ...(extra || {}),
  });
  return cli;
}

test("login: senha errada dá mensagem clara; certa guarda a sessão", async () => {
  const srv = servidorFalso({ key: "ANON" });
  const cli = clienteDe(srv);
  await assert.rejects(() => cli.login("gerente@teste", "errada"), /incorretos/);
  const s = await cli.login("gerente@teste", "certa");
  assert.equal(s.email, "gerente@teste");
  const cat = await cli.catalogo();
  assert.equal(cat.produtos.length, catalogo.produtos.length);
  // as chamadas REST usam o token do usuário, nunca só a chave anônima
  const rest = srv.chamadas.filter((c) => c.url.includes("/rest/v1/"));
  assert.ok(rest.length >= 2 && rest.every((c) => c.headers.Authorization === "Bearer tok1"));
});

test("sem login não lê nem grava", async () => {
  const cli = clienteDe(servidorFalso({ key: "ANON" }));
  await assert.rejects(() => cli.catalogo(), /Entre com seu e-mail/);
});

test("envio completo: ordem produtos -> compras -> despesas, uma vez só", async () => {
  const srv = servidorFalso({ key: "ANON" });
  const cli = clienteDe(srv);
  await cli.login("gerente@teste", "certa");
  const S = resolvido();
  const sent = Core.novoControle();
  const plano = Core.montarPlano(S, catalogo, sent);
  const res = await Core.enviar(cli, plano, sent, {});
  assert.deepEqual(res, { produtos: 5, compras: 16, despesas: 6 });
  assert.equal(srv.db.produtos.length, 5);
  assert.equal(srv.db.compras.length, 16);
  assert.equal(srv.db.despesas.length, 6);
  // compras de produto novo usam o id criado; as demais, o do catálogo
  const idsNovos = new Set(srv.db.produtos.map((p) => p.id));
  assert.equal(srv.db.compras.filter((c) => idsNovos.has(c.produto_id)).length, 5);
  assert.ok(srv.db.compras.every((c) => c.data === "2026-11-01"));
  assert.ok(srv.db.despesas.every((d) => d.data === "2026-11-01"));
  assert.ok(srv.db.despesas.some((d) => d.tipo === "onibus" && d.valor === 350));
  // não manda coluna que o app não pode gravar (created_by, apagado_*)
  for (const c of srv.db.compras) assert.deepEqual(Object.keys(c).sort(), ["custo_unit", "data", "id", "produto_id", "quantidade"]);
  // repetir não duplica nada
  const plano2 = Core.montarPlano(S, catalogo, sent);
  assert.deepEqual(plano2.aEnviar, { novos: 0, compras: 0, despesas: 0 });
  const res2 = await Core.enviar(cli, plano2, sent, {});
  assert.deepEqual(res2, { produtos: 0, compras: 0, despesas: 0 });
  assert.equal(srv.db.compras.length, 16);
});

test("falha no meio: ao repetir continua de onde parou, sem duplicar", async () => {
  const srv = servidorFalso({ key: "ANON", falhas: { compras: 4 } });
  const cli = clienteDe(srv);
  await cli.login("gerente@teste", "certa");
  const S = resolvido();
  const sent = Core.novoControle();
  let persistidas = 0;
  const hooks = { persist: () => persistidas++ };
  await assert.rejects(() => Core.enviar(cli, Core.montarPlano(S, catalogo, sent), sent, hooks), /queda de rede/);
  assert.equal(Object.keys(sent.compras).length, 3);
  assert.equal(Object.keys(sent.produtos).length, 5);
  assert.equal(Object.keys(sent.despesas).length, 6); // despesas vao primeiro
  assert.ok(persistidas >= 8);
  const res = await Core.enviar(cli, Core.montarPlano(S, catalogo, sent), sent, hooks);
  assert.deepEqual(res, { produtos: 0, compras: 13, despesas: 0 });
  assert.equal(srv.db.compras.length, 16);
  assert.equal(srv.db.produtos.length, 5);
});

test("não envia com pendências", async () => {
  const srv = servidorFalso({ key: "ANON" });
  const cli = clienteDe(srv);
  await cli.login("gerente@teste", "certa");
  const sent = Core.novoControle();
  await assert.rejects(() => Core.enviar(cli, Core.montarPlano(clone(viagem), catalogo, sent), sent, {}), /pendências/);
  assert.equal(srv.db.compras.length, 0);
});

test("despesa recusada pelo banco (ex.: falta a migracao Onibus) falha ANTES de gravar produtos e compras", async () => {
  const srv = servidorFalso({ key: "ANON", falhas: { despesas: 1 } });
  const cli = clienteDe(srv);
  await cli.login("gerente@teste", "certa");
  const sent = Core.novoControle();
  await assert.rejects(() => Core.enviar(cli, Core.montarPlano(resolvido(), catalogo, sent), sent, {}), /queda de rede/);
  assert.equal(srv.db.produtos.length, 0);
  assert.equal(srv.db.compras.length, 0);
});