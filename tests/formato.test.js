import assert from "node:assert/strict";
import { test } from "node:test";
import { brl, dataBR, hoje, nomeMes, numero, preenchido, qtd, somarDias, somarMeses, ultimoDiaDoMes } from "../lib/formato.js";

// Intl usa espaço não separável (U+00A0) entre "R$" e o valor
const sp = (s) => s.replace(/\s/g, " ");

test("brl formata em reais e tolera lixo", () => {
  assert.equal(sp(brl(1234.5)), "R$ 1.234,50");
  assert.equal(sp(brl(0)), "R$ 0,00");
  assert.equal(sp(brl(null)), "R$ 0,00");
  assert.equal(sp(brl("abc")), "R$ 0,00");
  assert.equal(sp(brl(-10)), "-R$ 10,00");
});

test("qtd usa vírgula e até 2 casas", () => {
  assert.equal(qtd(12), "12");
  assert.equal(qtd(1.5), "1,5");
  assert.equal(qtd(1.456), "1,46");
  assert.equal(qtd(undefined), "0");
});

test("dataBR", () => {
  assert.equal(dataBR("2026-09-27"), "27/09");
  assert.equal(dataBR("2026-09-27", true), "27/09/2026");
  assert.equal(dataBR(""), "");
  assert.equal(dataBR(null), "");
});

test("hoje devolve AAAA-MM-DD local", () => {
  assert.match(hoje(), /^\d{4}-\d{2}-\d{2}$/);
});

test("somarDias atravessa mês, ano e bissexto", () => {
  assert.equal(somarDias("2026-09-30", 1), "2026-10-01");
  assert.equal(somarDias("2026-01-01", -1), "2025-12-31");
  assert.equal(somarDias("2028-02-28", 1), "2028-02-29");
  assert.equal(somarDias("2026-09-27", 0), "2026-09-27");
});

test("numero aceita vírgula e ponto; vazio vira 0; inválido vira NaN", () => {
  assert.equal(numero("12,50"), 12.5);
  assert.equal(numero("12.50"), 12.5);
  assert.equal(numero("  7 "), 7);
  assert.equal(numero(""), 0);
  assert.equal(numero(null), 0);
  assert.equal(numero(undefined), 0);
  assert.ok(Number.isNaN(numero("abc")));
});

test("preenchido", () => {
  assert.equal(preenchido("0"), true);
  assert.equal(preenchido(0), true);
  assert.equal(preenchido(""), false);
  assert.equal(preenchido("   "), false);
  assert.equal(preenchido(null), false);
  assert.equal(preenchido(undefined), false);
});

test("nomeMes", () => {
  assert.equal(nomeMes("2026-09"), "Setembro 2026");
  assert.equal(nomeMes("2026-03"), "Março 2026");
});

test("somarMeses vira o ano nos dois sentidos", () => {
  assert.equal(somarMeses("2026-11", 2), "2027-01");
  assert.equal(somarMeses("2026-01", -1), "2025-12");
  assert.equal(somarMeses("2026-09", 0), "2026-09");
  assert.equal(somarMeses("2026-01", 24), "2028-01");
});

test("ultimoDiaDoMes", () => {
  assert.equal(ultimoDiaDoMes("2026-09"), "2026-09-30");
  assert.equal(ultimoDiaDoMes("2026-02"), "2026-02-28");
  assert.equal(ultimoDiaDoMes("2028-02"), "2028-02-29");
  assert.equal(ultimoDiaDoMes("2026-12"), "2026-12-31");
});
