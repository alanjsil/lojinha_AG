import assert from "node:assert/strict";
import { test } from "node:test";
import { limparCarrinho, linkWhatsApp, MAX_ITENS, mensagemPedido, mudarQuantidade, resumoCarrinho, telefoneValido } from "../lib/pedido.js";

const sp = (s) => s.replace(/\s/g, " ");

const produtos = [
  { id: "a", nome: "Anel", preco: "10.50", esgotado: false },
  { id: "b", nome: "Bolsa", preco: 100, esgotado: false },
  { id: "c", nome: "Colar", preco: 30, esgotado: true },
];

test("mudarQuantidade limita a 0..99 e zero remove", () => {
  let c = mudarQuantidade({}, "a", 1);
  assert.deepEqual(c, { a: 1 });
  c = mudarQuantidade(c, "a", 150);
  assert.deepEqual(c, { a: 99 });
  c = mudarQuantidade(c, "a", 0);
  assert.deepEqual(c, {});
  assert.deepEqual(mudarQuantidade({ a: 2 }, "a", -3), {});
});

test("mudarQuantidade não passa do máximo de itens diferentes", () => {
  const cheio = Object.fromEntries(Array.from({ length: MAX_ITENS }, (_, i) => [`p${i}`, 1]));
  assert.equal(mudarQuantidade(cheio, "novo", 1), cheio);
  assert.equal(mudarQuantidade(cheio, "p0", 3).p0, 3);
});

test("limparCarrinho tira esgotados, sumidos e quantidades inválidas", () => {
  assert.deepEqual(limparCarrinho({ a: 2, c: 1, x: 3, b: 0 }, produtos), { a: 2 });
  assert.deepEqual(limparCarrinho(null, produtos), {});
});

test("resumoCarrinho soma quantidade e total pelo preço da vitrine", () => {
  const r = resumoCarrinho({ a: 2, b: 1 }, produtos);
  assert.equal(r.quantidade, 3);
  assert.equal(r.total, 121);
  assert.deepEqual(
    r.itens.map((i) => i.nome),
    ["Anel", "Bolsa"],
  );
});

test("telefoneValido exige DDD", () => {
  assert.equal(telefoneValido("(51) 99999-0000"), true);
  assert.equal(telefoneValido("+55 51 99999-0000"), true);
  assert.equal(telefoneValido("99999-0000"), false);
});

test("mensagem e link do WhatsApp", () => {
  const texto = mensagemPedido({
    numero: 7,
    nome: "Ana",
    telefone: "51999990000",
    obs: " entregar à tarde ",
    itens: [{ nome: "Anel", quantidade: 2, preco: 10.5 }],
    total: 21,
  });
  assert.match(sp(texto), /Pedido nº 7/);
  assert.match(sp(texto), /2 × Anel — R\$ 21,00/);
  assert.match(sp(texto), /Total: R\$ 21,00/);
  assert.match(texto, /Obs\.: entregar à tarde$/);

  assert.equal(linkWhatsApp("", "x"), null);
  assert.equal(linkWhatsApp("(51) 99999-0000", "a b"), "https://wa.me/5551999990000?text=a%20b");
  assert.equal(linkWhatsApp("+55 51 99999-0000", "a"), "https://wa.me/5551999990000?text=a");
});

test("andamento do pedido", async () => {
  const { proximoStatus, mudancaValida, avisoStatus } = await import("../lib/pedido.js");
  assert.equal(proximoStatus("novo"), "confirmado");
  assert.equal(proximoStatus("pronto"), "entregue");
  assert.equal(proximoStatus("entregue"), null);
  assert.equal(proximoStatus("cancelado"), null);
  assert.equal(mudancaValida("novo", "pronto"), true);
  assert.equal(mudancaValida("pronto", "confirmado"), false);
  assert.equal(mudancaValida("entregue", "cancelado"), false);
  assert.equal(mudancaValida("confirmado", "cancelado"), true);
  assert.equal(mudancaValida("cancelado", "novo"), true);
  assert.equal(mudancaValida("cancelado", "entregue"), false);
  assert.equal(avisoStatus(7, "pronto").titulo, "Pedido nº 7: pronto");
});

test("telefone formatado", async () => {
  const { formatarTelefone } = await import("../lib/pedido.js");
  assert.equal(formatarTelefone("54988881234"), "(54) 98888-1234");
  assert.equal(formatarTelefone("5554988881234"), "(54) 98888-1234");
  assert.equal(formatarTelefone("5432221111"), "(54) 3222-1111");
  assert.equal(formatarTelefone(""), "");
});
