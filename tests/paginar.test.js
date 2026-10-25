import assert from "node:assert/strict";
import { test } from "node:test";
import { todas } from "../lib/paginar.js";

// banco de mentira que corta cada resposta em `corte` linhas, como o max_rows do PostgREST
const banco = (n, corte = 1000) => {
  const chamadas = [];
  const fazer = async (de, ate) => {
    chamadas.push([de, ate]);
    const fim = Math.min(ate, de + corte - 1, n - 1);
    return { data: Array.from({ length: Math.max(fim - de + 1, 0) }, (_, i) => de + i), error: null };
  };
  return { fazer, chamadas };
};

test("todas junta as páginas até vir uma incompleta", async () => {
  const { fazer, chamadas } = banco(2500);
  const { data, error } = await todas(fazer);
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.equal(data[2499], 2499);
  assert.deepEqual(chamadas, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("todas: múltiplo exato da página faz uma consulta vazia a mais", async () => {
  const { fazer, chamadas } = banco(2000);
  const { data } = await todas(fazer);
  assert.equal(data.length, 2000);
  assert.equal(chamadas.length, 3);
});

test("todas devolve o erro do banco", async () => {
  const { data, error } = await todas(async () => ({ data: null, error: { message: "x" } }));
  assert.equal(data, null);
  assert.equal(error.message, "x");
});
