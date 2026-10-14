import assert from "node:assert/strict";
import { test } from "node:test";
import { ehEquipe, inicioDe, rotaCliente, rotaPublica } from "../lib/rotas.js";

test("vitrine, login, cadastro e offline são públicas", () => {
  for (const p of ["/", "/login", "/cadastro", "/offline"]) assert.equal(rotaPublica(p), true, p);
});

test("telas do app exigem login", () => {
  for (const p of ["/vendas", "/estoque", "/saidas", "/resumos", "/log", "/painel", "/login/x", "/conta"]) {
    assert.equal(rotaPublica(p), false, p);
  }
});

test("área do cliente", () => {
  assert.equal(rotaCliente("/conta"), true);
  assert.equal(rotaCliente("/conta/pedido"), true);
  assert.equal(rotaCliente("/contas"), false);
  assert.equal(rotaCliente("/vendas"), false);
});

test("equipe só pelo app_metadata; o resto é cliente", () => {
  assert.equal(ehEquipe({ app_metadata: { papel: "gerente" } }), true);
  assert.equal(ehEquipe({ app_metadata: { papel: "socia" } }), true);
  assert.equal(ehEquipe({ app_metadata: {}, user_metadata: { papel: "gerente" } }), false);
  assert.equal(ehEquipe(null), false);
  assert.equal(inicioDe({ app_metadata: { papel: "vendedor" } }), "/vendas");
  assert.equal(inicioDe({ app_metadata: {} }), "/conta");
});
