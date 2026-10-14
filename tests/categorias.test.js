import assert from "node:assert/strict";
import { test } from "node:test";
import { agruparPorCategoria } from "../lib/categorias.js";
import { dimensoesReduzidas } from "../lib/imagem.js";

const categorias = [
  { id: "b", nome: "Bolsas", ordem: 2, foto_url: null },
  { id: "a", nome: "Anéis", ordem: 1, foto_url: "x" },
  { id: "c", nome: "Colares", ordem: 1, foto_url: null },
  { id: "v", nome: "Vazia", ordem: 0, foto_url: null },
];

test("agrupa por ordem e nome, com Outros no fim e sem categorias vazias", () => {
  const produtos = [
    { id: 1, categoria_id: "b" },
    { id: 2, categoria_id: null },
    { id: 3, categoria_id: "c" },
    { id: 4, categoria_id: "a" },
    { id: 5, categoria_id: "a" },
    { id: 6, categoria_id: "sumiu" },
  ];
  const g = agruparPorCategoria(produtos, categorias);
  assert.deepEqual(
    g.map((x) => x.nome),
    ["Anéis", "Colares", "Bolsas", "Outros"],
  );
  assert.deepEqual(
    g[0].produtos.map((p) => p.id),
    [4, 5],
  );
  assert.deepEqual(
    g[3].produtos.map((p) => p.id),
    [2, 6],
  );
  assert.equal(g[0].foto_url, "x");
});

test("lista vazia não gera grupos", () => {
  assert.deepEqual(agruparPorCategoria([], categorias), []);
});

test("reduz mantendo a proporção e nunca aumenta", () => {
  assert.deepEqual(dimensoesReduzidas(4000, 3000), { largura: 800, altura: 600 });
  assert.deepEqual(dimensoesReduzidas(1080, 1920), { largura: 450, altura: 800 });
  assert.deepEqual(dimensoesReduzidas(300, 200), { largura: 300, altura: 200 });
});
