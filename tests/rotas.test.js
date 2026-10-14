import assert from "node:assert/strict";
import { test } from "node:test";
import { rotaPublica } from "../lib/rotas.js";

test("vitrine, login e offline são públicas", () => {
  assert.equal(rotaPublica("/"), true);
  assert.equal(rotaPublica("/login"), true);
  assert.equal(rotaPublica("/offline"), true);
});

test("telas do app exigem login", () => {
  for (const p of ["/vendas", "/estoque", "/saidas", "/resumos", "/log", "/painel", "/login/x"]) {
    assert.equal(rotaPublica(p), false, p);
  }
});
