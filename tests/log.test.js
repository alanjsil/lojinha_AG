import assert from "node:assert/strict";
import { test } from "node:test";
import { aindaApagados, mudancas, resumoRegistro } from "../lib/log.js";

const sp = (s) => s.replace(/\s/g, " ");

test("mudancas mostra antes → depois e ignora colunas calculadas", () => {
  const linhas = mudancas({ quantidade: 2, preco_unit: 10, lucro: 5 }, { quantidade: 3, preco_unit: 12.5, lucro: 8 });
  assert.deepEqual(linhas.map(sp), ["Quantidade: 2 → 3", "Preço: R$ 10,00 → R$ 12,50"]);
});

test("mudancas formata datas e vazios", () => {
  assert.deepEqual(mudancas({ data: "2026-10-01", descricao: null }, { data: "2026-10-02", descricao: "luz" }), ["Data: 01/10/2026 → 02/10/2026", "Descrição: – → luz"]);
});

test("resumoRegistro descreve a linha pelo tipo de tabela", () => {
  const venda = { produto_id: "p1", quantidade: 2, preco_unit: 10, data: "2026-10-08" };
  assert.equal(sp(resumoRegistro("vendas", venda, () => "Camisa")), "Camisa · 2 × R$ 10,00 · 08/10");
  assert.equal(sp(resumoRegistro("despesas", { tipo: "luz", valor: 50, data: "2026-10-08" })), "luz · R$ 50,00 · 08/10");
  assert.equal(resumoRegistro("vendas", null), "");
});

test("aindaApagados considera só a última entrada de cada registro", () => {
  // da mais nova para a mais antiga
  const log = [
    { registro_id: "a", acao: "restaurou" },
    { registro_id: "b", acao: "apagou" },
    { registro_id: "a", acao: "apagou" },
    { registro_id: "b", acao: "criou" },
  ];
  assert.deepEqual([...aindaApagados(log)], ["b"]);
});

test("baixa de parcelas aparece legível no log", () => {
  const linhas = mudancas({ recebimentos: {} }, { recebimentos: { 2: "2026-12-01", 1: "2026-11-03" } });
  assert.deepEqual(linhas.map(sp), ["Parcelas recebidas: nenhuma → 1ª 03/11/2026 · 2ª 01/12/2026"]);
});

test("autoria da baixa não aparece como campo no log", () => {
  const linhas = mudancas({ recebimentos: {}, recebimentos_meta: {} }, { recebimentos: { 1: "2026-11-03" }, recebimentos_meta: { 1: { por: "u", em: "x" } } });
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /^Parcelas recebidas/);
});
