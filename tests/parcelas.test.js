import assert from "node:assert/strict";
import { test } from "node:test";
import { primeiroVencimentoVenda } from "../lib/parcelas.js";

test("venda de 23/10 vence a 1ª parcela em 08/11", () => {
  assert.equal(primeiroVencimentoVenda("2026-10-23"), "2026-11-08");
});

test("vira o ano", () => {
  assert.equal(primeiroVencimentoVenda("2026-12-31"), "2027-01-08");
  assert.equal(primeiroVencimentoVenda("2026-11-01"), "2026-12-08");
});
