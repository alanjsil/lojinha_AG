import assert from "node:assert/strict";
import { test } from "node:test";
import { novidadesPendentes } from "../lib/novidades.js";

const lista = [{ versao: "c" }, { versao: "b" }, { versao: "a" }];

test("sem versão vista mostra só a mais recente", () => {
  assert.deepEqual(novidadesPendentes(lista, null), [{ versao: "c" }]);
});

test("mostra tudo que veio depois da versão vista", () => {
  assert.deepEqual(novidadesPendentes(lista, "a"), [{ versao: "c" }, { versao: "b" }]);
});

test("já viu a mais recente: nada a mostrar", () => {
  assert.deepEqual(novidadesPendentes(lista, "c"), []);
  assert.deepEqual(novidadesPendentes([], null), []);
});
