import assert from "node:assert/strict";
import { test } from "node:test";
import { JANELA_VENDA_HORAS, motivoSemAcessoVenda, podeMexerNaVenda } from "../lib/vendas.js";

const agora = new Date("2026-10-24T12:00:00Z");
const horasAtras = (h) => new Date(agora.getTime() - h * 3600 * 1000).toISOString();
const venda = (extra) => ({ vendedorId: "v1", criadaEm: horasAtras(1), agora, ...extra });

test("a janela é de 48 horas", () => {
  assert.equal(JANELA_VENDA_HORAS, 48);
});

test("gerente mexe em qualquer venda, a qualquer momento", () => {
  assert.equal(motivoSemAcessoVenda(venda({ papel: "gerente", usuarioId: "g1", criadaEm: horasAtras(24 * 400) })), null);
  assert.equal(podeMexerNaVenda(venda({ papel: "gerente", usuarioId: "v1" })), true);
});

test("vendedor mexe na própria venda dentro de 48 h", () => {
  assert.equal(podeMexerNaVenda(venda({ papel: "vendedor", usuarioId: "v1" })), true);
  assert.equal(podeMexerNaVenda(venda({ papel: "vendedor", usuarioId: "v1", criadaEm: horasAtras(47.9) })), true);
});

test("depois de 48 h só o gerente (o limite já é recusa)", () => {
  assert.match(motivoSemAcessoVenda(venda({ papel: "vendedor", usuarioId: "v1", criadaEm: horasAtras(48) })), /48 horas/);
  assert.equal(podeMexerNaVenda(venda({ papel: "vendedor", usuarioId: "v1", criadaEm: horasAtras(24 * 30) })), false);
});

test("vendedor não mexe na venda de outro, nem recente", () => {
  assert.match(motivoSemAcessoVenda(venda({ papel: "vendedor", usuarioId: "v2" })), /quem lançou/);
});

test("sócia segue a regra do vendedor: própria até 48 h, sem poder de gerente", () => {
  assert.equal(podeMexerNaVenda(venda({ papel: "socia", usuarioId: "v1" })), true);
  assert.equal(podeMexerNaVenda(venda({ papel: "socia", usuarioId: "v1", criadaEm: horasAtras(60) })), false);
  assert.equal(podeMexerNaVenda(venda({ papel: "socia", usuarioId: "s1" })), false);
});

test("cliente, papel desconhecido e dados faltando são recusados", () => {
  assert.equal(podeMexerNaVenda(venda({ papel: "cliente", usuarioId: "v1" })), false);
  assert.equal(podeMexerNaVenda(venda({ papel: undefined, usuarioId: "v1" })), false);
  assert.equal(podeMexerNaVenda(venda({ papel: "vendedor", usuarioId: undefined, vendedorId: undefined })), false);
  assert.equal(podeMexerNaVenda(venda({ papel: "vendedor", usuarioId: "v1", criadaEm: "lixo" })), false);
  assert.equal(podeMexerNaVenda(venda({ papel: "vendedor", usuarioId: "v1", criadaEm: null })), false);
});
