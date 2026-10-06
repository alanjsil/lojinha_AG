"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { numero, preenchido, qtd } from "../lib/formato";
import { createClient, usuarioAtual } from "../lib/supabase/server";

const PAGAMENTOS = ["a_vista", "cartao"];
const TIPOS_DESPESA = ["aluguel", "agua", "luz", "internet", "outros"];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

class ErroDeNegocio extends Error {}
const falha = (msg) => {
  throw new ErroDeNegocio(msg);
};

// Toda ação confere o login (o middleware não cobre chamadas de Server Action de outra origem)
// e devolve { ok } ou { ok: false, erro } em vez de estourar exceção na tela.
async function executar(fn, { exigeGerente = false } = {}) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) falha("Sessão expirada. Entre novamente.");
    if (exigeGerente) {
      const usuario = await usuarioAtual(supabase);
      if (!usuario?.gerente) falha("Só o gerente pode fazer isso.");
    }
    await fn(supabase, user);
    return { ok: true };
  } catch (e) {
    if (e instanceof ErroDeNegocio) return { ok: false, erro: e.message };
    console.error(e);
    return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
  }
}

function valorPositivo(texto, nome, { permiteZero = false } = {}) {
  if (!preenchido(texto)) falha(`Informe ${nome}.`);
  const n = numero(texto);
  if (!Number.isFinite(n) || n < 0 || (!permiteZero && n === 0))
    falha(`${nome[0].toUpperCase()}${nome.slice(1)} inválido.`);
  return n;
}

function dataValida(data) {
  if (!DATA_ISO.test(data ?? "")) falha("Data inválida.");
  return data;
}

async function saldoDoProduto(supabase, produtoId) {
  const { data, error } = await supabase
    .from("estoque_atual")
    .select("saldo, nome, ativo")
    .eq("id", produtoId)
    .single();
  if (error || !data) falha("Produto não encontrado.");
  return data;
}

// só cartão parcela (1 a 12x); qualquer outra forma é sempre 1 parcela
function parcelasValidas(pagamento, parcelas) {
  if (pagamento !== "cartao") return 1;
  const n = Number(parcelas ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 12)
    falha("Parcelas inválidas (1 a 12).");
  return n;
}

function atualizarTudo() {
  ["/vendas", "/estoque", "/saidas", "/resumos"].forEach((p) =>
    revalidatePath(p),
  );
}

// ---------- Vendas ----------

export async function registrarVenda({
  produtoId,
  quantidade,
  preco,
  pagamento,
  parcelas,
  data,
}) {
  return executar(async (supabase) => {
    if (!produtoId) falha("Escolha o produto.");
    const q = valorPositivo(quantidade, "a quantidade");
    const p = valorPositivo(preco, "o preço");
    if (!PAGAMENTOS.includes(pagamento)) falha("Escolha a forma de pagamento.");
    const nParcelas = parcelasValidas(pagamento, parcelas);

    const produto = await saldoDoProduto(supabase, produtoId);
    if (!produto.ativo) falha("Este produto está inativo.");
    if (q > produto.saldo)
      falha(
        `Estoque insuficiente de ${produto.nome}: restam ${qtd(produto.saldo)}.`,
      );

    const { error } = await supabase.from("vendas").insert({
      data: dataValida(data),
      produto_id: produtoId,
      quantidade: q,
      preco_unit: p,
      pagamento,
      parcelas: nParcelas,
    });
    if (error) throw error;
    atualizarTudo();
  });
}

export async function editarVenda({
  id,
  quantidade,
  preco,
  pagamento,
  parcelas,
  data,
}) {
  return executar(async (supabase) => {
    const q = valorPositivo(quantidade, "a quantidade");
    const p = valorPositivo(preco, "o preço");
    if (!PAGAMENTOS.includes(pagamento)) falha("Escolha a forma de pagamento.");
    const nParcelas = parcelasValidas(pagamento, parcelas);

    const { data: antiga, error: erroVenda } = await supabase
      .from("vendas")
      .select("produto_id, quantidade")
      .eq("id", id)
      .single();
    if (erroVenda || !antiga) falha("Venda não encontrada.");

    // o saldo atual já desconta a quantidade antiga desta venda
    const produto = await saldoDoProduto(supabase, antiga.produto_id);
    const limite = produto.saldo + Number(antiga.quantidade);
    if (q > limite)
      falha(
        `Estoque insuficiente de ${produto.nome}: dá para vender até ${qtd(limite)}.`,
      );

    const { data: salvas, error } = await supabase
      .from("vendas")
      .update({
        data: dataValida(data),
        quantidade: q,
        preco_unit: p,
        pagamento,
        parcelas: nParcelas,
      })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!salvas?.length) falha("Você não pode editar esta venda.");
    atualizarTudo();
  });
}

export async function excluirVenda(id) {
  return executar(async (supabase) => {
    const { error } = await supabase.from("vendas").delete().eq("id", id);
    if (error) throw error;
    atualizarTudo();
  });
}

// ---------- Produtos ----------

// Custo e preço são obrigatórios: sem os dois o produto não é salvo.
export async function salvarProduto({
  id,
  nome,
  unidade,
  custo,
  preco,
  ativo = true,
}) {
  return executar(async (supabase) => {
    const n = (nome ?? "").trim();
    if (!n) falha("Informe o nome do produto.");
    const c = valorPositivo(custo, "o custo", { permiteZero: true });
    const p = valorPositivo(preco, "o preço");
    const campos = {
      nome: n,
      unidade: (unidade ?? "").trim() || "un",
      custo: c,
      preco: p,
      ativo: Boolean(ativo),
    };

    const { error } = id
      ? await supabase.from("produtos").update(campos).eq("id", id)
      : await supabase.from("produtos").insert(campos);
    if (error?.code === "23505") falha("Já existe um produto com esse nome.");
    if (error) throw error;
    atualizarTudo();
  });
}

// ---------- Compras (entrada de estoque) ----------

export async function registrarCompra({
  produtoId,
  quantidade,
  custo,
  fornecedor,
  data,
}) {
  return executar(async (supabase) => {
    if (!produtoId) falha("Escolha o produto.");
    const q = valorPositivo(quantidade, "a quantidade");
    const c = valorPositivo(custo, "o custo unitário", { permiteZero: true });

    // o custo do produto é recalculado automaticamente (trigger) como a média
    // ponderada de todas as compras; vendas antigas guardam o custo da época
    const { error } = await supabase.from("compras").insert({
      data: dataValida(data),
      produto_id: produtoId,
      quantidade: q,
      custo_unit: c,
      fornecedor: (fornecedor ?? "").trim() || null,
    });
    if (error) throw error;
    atualizarTudo();
  });
}

export async function excluirCompra(id) {
  return executar(async (supabase) => {
    const { error } = await supabase.from("compras").delete().eq("id", id);
    if (error) throw error;
    atualizarTudo();
  });
}

// ---------- Despesas ----------

export async function registrarDespesa({ tipo, descricao, valor, data }) {
  return executar(
    async (supabase) => {
      if (!TIPOS_DESPESA.includes(tipo)) falha("Escolha o tipo da despesa.");
      const v = valorPositivo(valor, "o valor");
      const { error } = await supabase.from("despesas").insert({
        data: dataValida(data),
        tipo,
        descricao: (descricao ?? "").trim() || null,
        valor: v,
      });
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

export async function excluirDespesa(id) {
  return executar(
    async (supabase) => {
      const { error } = await supabase.from("despesas").delete().eq("id", id);
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

// ---------- Contagem cíclica ----------

// Guarda o que o sistema achava e o que foi contado; a diferença ajusta o estoque.
export async function registrarContagem({
  produtoId,
  quantidade,
  observacao,
  data,
}) {
  return executar(async (supabase) => {
    if (!produtoId) falha("Escolha o produto.");
    const contada = valorPositivo(quantidade, "a quantidade contada", {
      permiteZero: true,
    });
    const produto = await saldoDoProduto(supabase, produtoId);

    const { error } = await supabase.from("contagens_estoque").insert({
      data: dataValida(data),
      produto_id: produtoId,
      quantidade_sistema: produto.saldo,
      quantidade_contada: contada,
      observacao: (observacao ?? "").trim() || null,
    });
    if (error) throw error;
    atualizarTudo();
  });
}

// ---------- Sessão ----------

export async function sair() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
