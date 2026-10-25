import assert from "node:assert/strict";
import { test } from "node:test";
import { despesasPorTipo, indicadoresResumo, motivoDaContagem, perdasPorMotivo } from "../lib/resumo.js";

const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("margem mínima compara com a margem de contribuição, não com a bruta", () => {
  // bruta 30% cobre os 25% de despesas, mas depois das comissões (10%) sobra 20%: não cobre
  const r = indicadoresResumo({ receita: 1000, lucro: 300, comissoes: 100, despesas: 250 });
  perto(r.margemBruta, 0.3);
  perto(r.margemContrib, 0.2);
  perto(r.margemMinima, 0.25);
  assert.equal(r.minimaOk, false);
  perto(r.pontoEquilibrio, 1250);
  assert.equal(r.liquido, -50);
});

test("meta: faturamento em que sobra 20% do lucro bruto antes do pró-labore", () => {
  const r = indicadoresResumo({ receita: 1000, lucro: 400, comissoes: 100, despesas: 100, proLabore: 50 });
  // contrib 30%, bruta 40% → denom 0,30 − 0,08 = 0,22 → 100 / 0,22
  perto(r.metaFaturar, 100 / 0.22);
  // conferindo: no alvo, sobra = 20% do lucro bruto
  const v = r.metaFaturar;
  perto(v * 0.3 - 100, 0.2 * v * 0.4);
  assert.equal(r.liquido, 150);
  perto(r.pctMeta, 1000 / r.metaFaturar);
});

test("sem vendas: nada de divisão por zero", () => {
  const r = indicadoresResumo({ receita: 0, lucro: 0, comissoes: 0, despesas: 100 });
  assert.equal(r.pontoEquilibrio, null);
  assert.equal(r.metaFaturar, null);
  assert.equal(r.pctMeta, null);
  assert.equal(r.margemMinima, 0);
});

test("despesas por tipo, maior primeiro, com rótulo", () => {
  const r = despesasPorTipo([
    { tipo: "luz", valor: "50" },
    { tipo: "aluguel", valor: 800 },
    { tipo: "luz", valor: 30 },
  ]);
  assert.deepEqual(r, [
    { tipo: "aluguel", nome: "Aluguel", valor: 800 },
    { tipo: "luz", nome: "Luz", valor: 80 },
  ]);
});

test("motivo da contagem: obrigatório só com diferença", () => {
  assert.deepEqual(motivoDaContagem(0, "perda"), { motivo: null });
  assert.ok(motivoDaContagem(-2, "").erro);
  assert.ok(motivoDaContagem(1, "xyz").erro);
  assert.deepEqual(motivoDaContagem(-2, "quebra"), { motivo: "quebra" });
});

test("perdas: só faltas, por motivo, ao custo atual", () => {
  const custo = { a: 10, b: 4 };
  const r = perdasPorMotivo(
    [
      { produto_id: "a", diferenca: -2, motivo: "perda" },
      { produto_id: "b", diferenca: "-1", motivo: "quebra" },
      { produto_id: "a", diferenca: 3, motivo: "erro" },
      { produto_id: "b", diferenca: -5, motivo: null },
    ],
    (id) => custo[id],
  );
  assert.equal(r.total, 44);
  assert.deepEqual(
    r.itens.map((i) => [i.motivo, i.quantidade, i.valor]),
    [
      ["perda", 2, 20],
      ["sem_motivo", 5, 20],
      ["quebra", 1, 4],
    ],
  );
});
