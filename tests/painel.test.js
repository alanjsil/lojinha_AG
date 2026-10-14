import assert from "node:assert/strict";
import { test } from "node:test";
import { arcoRosca, caminhoLinha, escalaY, fatias } from "../lib/graficos.js";
import { chavesPeriodo, indicadores, periodoPainel, resumoEstoque, seriePorTempo, somarPor } from "../lib/painel.js";

const vendas = [
  { id: "1", grupo_id: "g", data: "2026-10-01", quantidade: 2, preco_unit: 10, lucro: 8, vendedor_id: "a" },
  { id: "2", grupo_id: "g", data: "2026-10-01", quantidade: 1, preco_unit: 30, lucro: 10, vendedor_id: "a" },
  { id: "3", grupo_id: null, data: "2026-10-03", quantidade: 1, preco_unit: 50, lucro: -5, vendedor_id: "b" },
];

test("períodos do painel", () => {
  assert.deepEqual(periodoPainel("mes", "2026-10-14", "2026-10"), { de: "2026-10-01", ate: "2026-10-14", por: "dia" });
  assert.deepEqual(periodoPainel("mes", "2026-10-14", "2026-09"), { de: "2026-09-01", ate: "2026-09-30", por: "dia" });
  assert.deepEqual(periodoPainel("30", "2026-10-14", "2026-10"), { de: "2026-09-15", ate: "2026-10-14", por: "dia" });
  assert.deepEqual(periodoPainel("ano", "2026-10-14", "2026-10"), { de: "2026-01-01", ate: "2026-10-14", por: "mes" });
});

test("indicadores: grupo conta como uma venda; líquido desconta comissão, despesa e pró-labore", () => {
  const r = indicadores({ vendas, parcelas: [{ comissao: 4, comissao_socia: 1 }], despesas: [{ valor: 3 }], proLabore: 2 });
  assert.equal(r.receita, 100);
  assert.equal(r.lucro, 13);
  assert.equal(r.custo, 87);
  assert.equal(r.comissoes, 5);
  assert.equal(r.liquido, 3);
  assert.equal(r.nVendas, 2);
  assert.equal(r.ticketMedio, 50);
  assert.equal(r.margemBruta, 0.13);
});

test("indicadores sem vendas não dividem por zero", () => {
  const r = indicadores({ vendas: [] });
  assert.equal(r.ticketMedio, 0);
  assert.equal(r.margemBruta, 0);
});

test("série preenche os dias sem venda e agrupa por mês", () => {
  const s = seriePorTempo(vendas, "2026-10-01", "2026-10-04");
  assert.deepEqual(
    s.map((p) => [p.chave, p.receita, p.lucro]),
    [
      ["2026-10-01", 50, 18],
      ["2026-10-02", 0, 0],
      ["2026-10-03", 50, -5],
      ["2026-10-04", 0, 0],
    ],
  );
  assert.deepEqual(chavesPeriodo("2025-11-20", "2026-02-01", "mes"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.equal(seriePorTempo(vendas, "2026-09-01", "2026-10-31", "mes")[1].receita, 100);
});

test("somarPor ordena pela receita e conta vendas por grupo", () => {
  const r = somarPor(
    vendas,
    (v) => v.vendedor_id,
    (v) => v.vendedor_id.toUpperCase(),
  );
  assert.deepEqual(
    r.map((g) => [g.nome, g.receita, g.vendas, g.quantidade]),
    [
      ["A", 50, 1, 3],
      ["B", 50, 1, 1],
    ],
  );
});

test("resumo do estoque", () => {
  const estoque = [
    { id: "x", ativo: true, saldo: 2, custo: 5, preco: 9 },
    { id: "y", ativo: true, saldo: 0, custo: 1, preco: 2 },
    { id: "z", ativo: false, saldo: 4, custo: 1, preco: 2 },
    { id: "w", ativo: true, saldo: 1, custo: 1, preco: 2 },
  ];
  const r = resumoEstoque(estoque, new Set(["w"]));
  assert.equal(r.valorCusto, 11);
  assert.equal(r.valorVenda, 20);
  assert.deepEqual(
    r.esgotados.map((e) => e.id),
    ["y"],
  );
  assert.deepEqual(
    r.parados.map((e) => e.id),
    ["x"],
  );
});

test("escala do eixo y arredonda para cima", () => {
  assert.deepEqual(escalaY(930), { teto: 1000, marcas: [0, 250, 500, 750, 1000] });
  assert.deepEqual(escalaY(80), { teto: 80, marcas: [0, 20, 40, 60, 80] });
  assert.equal(escalaY(0).teto, 1);
});

test("caminho da linha vai da base ao topo", () => {
  assert.equal(caminhoLinha([0, 10], { inicio: 0, fim: 100, topo: 0, base: 50, teto: 10 }), "M0.0,50.0 L100.0,0.0");
});

test("fatias e arcos", () => {
  const f = fatias([1, 3]);
  assert.equal(f[0].fracao, 0.25);
  assert.ok(Math.abs(f[1].fim - 2 * Math.PI) < 1e-9);
  assert.deepEqual(
    fatias([0, 0]).map((x) => x.fracao),
    [0, 0],
  );
  assert.match(arcoRosca(50, 50, 40, 25, 0, Math.PI / 2), /^M50\.00,10\.00 A40,40 0 0 1 90\.00,50\.00/);
  assert.equal(arcoRosca(50, 50, 40, 25, 0, 2 * Math.PI).split("M").length - 1, 2);
});
