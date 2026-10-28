import assert from "node:assert/strict";
import { test } from "node:test";
import { comissaoDaSocia, validarVendedor } from "../lib/vendedores.js";

test("sócia fica com 35% menos o que o vendedor ganha acima de 10%", () => {
  assert.equal(comissaoDaSocia(10), 35);
  assert.equal(comissaoDaSocia(12), 33);
  assert.equal(comissaoDaSocia(15), 30);
  assert.equal(comissaoDaSocia(40), 5);
});

const base = { nome: " Ana  Paula ", telefone: "(54) 98888-1234", email: "Ana@Loja.com ", senha: "segredo12", comissao: "" };

test("cadastro limpa os campos e usa 10% por padrão", () => {
  assert.deepEqual(validarVendedor(base), {
    nome: "Ana Paula",
    telefone: "54988881234",
    comissao_pct: 10,
    email: "ana@loja.com",
    senha: "segredo12",
  });
});

test("comissão só de 10 a 40", () => {
  assert.equal(validarVendedor({ ...base, comissao: "12" }).comissao_pct, 12);
  assert.equal(validarVendedor({ ...base, comissao: "40" }).comissao_pct, 40);
  assert.match(validarVendedor({ ...base, comissao: "8" }).erro, /10% a 40%/);
  assert.match(validarVendedor({ ...base, comissao: "41" }).erro, /10% a 40%/);
});

test("recusa celular, e-mail e senha inválidos", () => {
  assert.match(validarVendedor({ ...base, telefone: "1234" }).erro, /Celular/);
  assert.match(validarVendedor({ ...base, email: "ana" }).erro, /E-mail/);
  assert.match(validarVendedor({ ...base, senha: "curta" }).erro, /8 caracteres/);
});

test("edição não pede e-mail nem senha", () => {
  assert.deepEqual(validarVendedor({ nome: "Ana", telefone: "54988881234", comissao: "15" }, { novo: false }), {
    nome: "Ana",
    telefone: "54988881234",
    comissao_pct: 15,
  });
});
