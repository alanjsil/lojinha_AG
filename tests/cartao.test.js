import assert from "node:assert/strict";
import { test } from "node:test";
import { parcelasSaida, primeiroVencimento, vencimentoFatura } from "../lib/cartao.js";

test("fecha 28 e vence 10: antes do fechamento vence no mês seguinte", () => {
  assert.equal(vencimentoFatura("2026-10-05", 28, 10), "2026-11-10");
  assert.equal(vencimentoFatura("2026-10-27", 28, 10), "2026-11-10");
});

test("no dia do fechamento ou depois, cai na fatura seguinte", () => {
  assert.equal(vencimentoFatura("2026-10-28", 28, 10), "2026-12-10");
  assert.equal(vencimentoFatura("2026-10-31", 28, 10), "2026-12-10");
});

test("vencimento depois do fechamento vence no mesmo mês", () => {
  assert.equal(vencimentoFatura("2026-10-01", 3, 10), "2026-10-10");
  assert.equal(vencimentoFatura("2026-10-03", 3, 10), "2026-11-10");
});

test("vira o ano", () => {
  assert.equal(vencimentoFatura("2026-12-15", 28, 10), "2027-01-10");
  assert.equal(vencimentoFatura("2026-12-29", 28, 10), "2027-02-10");
});

test("à vista sai na própria data", () => {
  assert.equal(primeiroVencimento("2026-10-05", null), "2026-10-05");
  assert.equal(primeiroVencimento("2026-10-05", { dia_fechamento: 28, dia_vencimento: 10 }), "2026-11-10");
});

test("parcelas mensais com a sobra na última", () => {
  assert.deepEqual(parcelasSaida(100, 3, "2026-11-10"), [
    { numero: 1, vencimento: "2026-11-10", valor: 33.33 },
    { numero: 2, vencimento: "2026-12-10", valor: 33.33 },
    { numero: 3, vencimento: "2027-01-10", valor: 33.34 },
  ]);
  const doze = parcelasSaida(1000, 12, "2026-11-10");
  assert.equal(doze.length, 12);
  assert.equal(doze[11].vencimento, "2027-10-10");
  assert.equal(Math.round(doze.reduce((s, p) => s + p.valor, 0) * 100), 100000);
  assert.deepEqual(parcelasSaida(50, 1, "2026-10-05"), [{ numero: 1, vencimento: "2026-10-05", valor: 50 }]);
});
