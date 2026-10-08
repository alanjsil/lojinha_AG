"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { numero, preenchido, qtd } from "../lib/formato";
import { createClient, usuarioAtual } from "../lib/supabase/server";

const PAGAMENTOS = ["a_vista", "cartao"];
const TIPOS_DESPESA = ["aluguel", "agua", "luz", "internet", "gasolina", "alimentacao", "pedagio", "outros"];
const TIPOS_LANCAMENTO = ["pro_labore", "pagamento_comissao", "saque", "aporte", "capital_inicial", "repasse"];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

class ErroDeNegocio extends Error {}
const falha = (msg) => {
  throw new ErroDeNegocio(msg);
};

// Toda ação confere o login (o proxy não cobre chamadas de Server Action de outra origem)
// e devolve { ok } ou { ok: false, erro } em vez de estourar exceção na tela.
async function executar(fn, { exigeGerente = false } = {}) {
  try {
    const supabase = await createClient();
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
  if (!Number.isFinite(n) || n < 0 || (!permiteZero && n === 0)) falha(`${nome[0].toUpperCase()}${nome.slice(1)} inválido.`);
  return n;
}

function dataValida(data) {
  if (!DATA_ISO.test(data ?? "")) falha("Data inválida.");
  return data;
}

async function saldoDoProduto(supabase, produtoId) {
  const { data, error } = await supabase.from("estoque_atual").select("saldo, nome, ativo").eq("id", produtoId).single();
  if (error || !data) falha("Produto não encontrado.");
  return data;
}

// só cartão parcela (1 a 12x); qualquer outra forma é sempre 1 parcela
function parcelasValidas(pagamento, parcelas) {
  if (pagamento !== "cartao") return 1;
  const n = Number(parcelas ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 12) falha("Parcelas inválidas (1 a 12).");
  return n;
}

function atualizarTudo() {
  ["/vendas", "/estoque", "/saidas", "/resumos"].forEach((p) => revalidatePath(p));
}

// ---------- Vendas ----------

export async function registrarVenda({ produtoId, quantidade, preco, pagamento, parcelas, data }) {
  return executar(async (supabase) => {
    if (!produtoId) falha("Escolha o produto.");
    const q = valorPositivo(quantidade, "a quantidade");
    const p = valorPositivo(preco, "o preço");
    if (!PAGAMENTOS.includes(pagamento)) falha("Escolha a forma de pagamento.");
    const nParcelas = parcelasValidas(pagamento, parcelas);

    const produto = await saldoDoProduto(supabase, produtoId);
    if (!produto.ativo) falha("Este produto está inativo.");
    if (q > produto.saldo) falha(`Estoque insuficiente de ${produto.nome}: restam ${qtd(produto.saldo)}.`);

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

export async function editarVenda({ id, quantidade, preco, pagamento, parcelas, data }) {
  return executar(async (supabase) => {
    const q = valorPositivo(quantidade, "a quantidade");
    const p = valorPositivo(preco, "o preço");
    if (!PAGAMENTOS.includes(pagamento)) falha("Escolha a forma de pagamento.");
    const nParcelas = parcelasValidas(pagamento, parcelas);

    const { data: antiga, error: erroVenda } = await supabase.from("vendas").select("produto_id, quantidade").eq("id", id).single();
    if (erroVenda || !antiga) falha("Venda não encontrada.");

    // o saldo atual já desconta a quantidade antiga desta venda
    const produto = await saldoDoProduto(supabase, antiga.produto_id);
    const limite = produto.saldo + Number(antiga.quantidade);
    if (q > limite) falha(`Estoque insuficiente de ${produto.nome}: dá para vender até ${qtd(limite)}.`);

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
export async function salvarProduto({ id, nome, unidade, custo, preco, ativo = true }) {
  return executar(async (supabase) => {
    const gerente = Boolean((await usuarioAtual(supabase))?.gerente);
    if (!gerente && !id) falha("Só o gerente pode cadastrar produtos.");
    const n = (nome ?? "").trim();
    if (!n) falha("Informe o nome do produto.");
    const campos = {
      nome: n,
      unidade: (unidade ?? "").trim() || "un",
      ativo: Boolean(ativo),
    };
    // Só o gerente altera custo e preço do produto; para o vendedor os valores enviados são ignorados
    // (na venda ele ainda ajusta o preço cobrado, que é outro campo).
    if (gerente) {
      campos.custo = valorPositivo(custo, "o custo", { permiteZero: true });
      campos.preco = valorPositivo(preco, "o preço");
    }

    const { error } = id ? await supabase.from("produtos").update(campos).eq("id", id) : await supabase.from("produtos").insert(campos);
    if (error?.code === "23505") falha("Já existe um produto com esse nome.");
    if (error) throw error;
    atualizarTudo();
  });
}

// ---------- Compras (entrada de estoque) ----------

export async function registrarCompra({ produtoId, quantidade, custo, fornecedor, data }) {
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

// Só o gerente edita compra (data, quantidade, custo, fornecedor); o custo médio é refeito por trigger.
export async function editarCompra({ id, quantidade, custo, fornecedor, data }) {
  return executar(
    async (supabase) => {
      const q = valorPositivo(quantidade, "a quantidade");
      const c = valorPositivo(custo, "o custo unitário", { permiteZero: true });
      const { data: antiga, error: erroCompra } = await supabase.from("compras").select("produto_id, quantidade").eq("id", id).single();
      if (erroCompra || !antiga) falha("Compra não encontrada.");

      // diminuir a compra tira mercadoria do estoque: não pode deixar o saldo negativo
      const produto = await saldoDoProduto(supabase, antiga.produto_id);
      const novoSaldo = produto.saldo - Number(antiga.quantidade) + q;
      if (novoSaldo < 0) falha(`Estoque de ${produto.nome} ficaria negativo (${qtd(novoSaldo)}). Já foi vendido mais do que isso.`);

      const { data: linhas, error } = await supabase
        .from("compras")
        .update({ data: dataValida(data), quantidade: q, custo_unit: c, fornecedor: (fornecedor ?? "").trim() || null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!linhas?.length) falha("Compra não encontrada ou sem permissão para editar.");
      atualizarTudo();
    },
    { exigeGerente: true },
  );
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

export async function editarDespesa({ id, tipo, descricao, valor, data }) {
  return executar(
    async (supabase) => {
      if (!TIPOS_DESPESA.includes(tipo)) falha("Escolha o tipo da despesa.");
      const v = valorPositivo(valor, "o valor");
      const { data: linhas, error } = await supabase
        .from("despesas")
        .update({
          data: dataValida(data),
          tipo,
          descricao: (descricao ?? "").trim() || null,
          valor: v,
        })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!linhas?.length) falha("Despesa não encontrada ou sem permissão para editar.");
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

// ---------- Lançamentos dos sócios ----------

export async function registrarLancamento({ tipo, valor, data, descricao, vendedorId }) {
  return executar(
    async (supabase) => {
      if (!TIPOS_LANCAMENTO.includes(tipo)) falha("Escolha o tipo do lançamento.");
      const v = valorPositivo(valor, "o valor");
      const comVendedor = tipo === "pagamento_comissao" || tipo === "repasse";
      if (comVendedor && !vendedorId) falha("Escolha o vendedor.");
      const { error } = await supabase.from("lancamentos").insert({
        data: dataValida(data),
        tipo,
        valor: v,
        descricao: (descricao ?? "").trim() || null,
        vendedor_id: comVendedor ? vendedorId : null,
      });
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

// O tipo não muda; vendedor só vale para pagamento de comissão e repasse.
export async function editarLancamento({ id, valor, data, descricao, vendedorId }) {
  return executar(
    async (supabase) => {
      const v = valorPositivo(valor, "o valor");
      const { data: atual, error: erroLanc } = await supabase.from("lancamentos").select("tipo").eq("id", id).single();
      if (erroLanc || !atual) falha("Lançamento não encontrado.");
      const comVendedor = atual.tipo === "pagamento_comissao" || atual.tipo === "repasse";
      if (comVendedor && !vendedorId) falha("Escolha o vendedor.");
      const campos = { data: dataValida(data), valor: v, descricao: (descricao ?? "").trim() || null };
      if (comVendedor) campos.vendedor_id = vendedorId;
      const { data: linhas, error } = await supabase.from("lancamentos").update(campos).eq("id", id).select("id");
      if (error) throw error;
      if (!linhas?.length) falha("Lançamento não encontrado ou sem permissão para editar.");
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

export async function excluirLancamento(id) {
  return executar(
    async (supabase) => {
      const { error } = await supabase.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

// ---------- Log: restaurar registro apagado ----------

const TABELAS_RESTAURAVEIS = ["vendas", "compras", "despesas", "lancamentos", "contagens_estoque"];

// A exclusão é lógica (apagado_em); a função do banco desfaz e os triggers refazem parcelas/custo médio.
export async function restaurarRegistro({ tabela, id }) {
  return executar(
    async (supabase) => {
      if (!TABELAS_RESTAURAVEIS.includes(tabela) || !id) falha("Registro inválido.");
      const { error } = await supabase.rpc("restaurar_registro", { p_tabela: tabela, p_id: id });
      if (error?.code === "P0001") falha(error.message);
      if (error) throw error;
      atualizarTudo();
      revalidatePath("/log");
    },
    { exigeGerente: true },
  );
}

// ---------- Contagem cíclica ----------

// Guarda o que o sistema achava e o que foi contado; a diferença ajusta o estoque.
export async function registrarContagem({ produtoId, quantidade, observacao, data }) {
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

// Só o gerente edita ou exclui contagem. quantidade_sistema é a fotografia do momento; só a contada muda
// (a diferença é recalculada). Nenhuma das duas pode deixar o estoque negativo.
export async function editarContagem({ id, quantidade, observacao, data }) {
  return executar(
    async (supabase) => {
      const contada = valorPositivo(quantidade, "a quantidade contada", { permiteZero: true });
      const { data: antiga, error: erroContagem } = await supabase.from("contagens_estoque").select("produto_id, quantidade_sistema, diferenca").eq("id", id).single();
      if (erroContagem || !antiga) falha("Contagem não encontrada.");

      const produto = await saldoDoProduto(supabase, antiga.produto_id);
      const novoSaldo = produto.saldo - Number(antiga.diferenca) + (contada - Number(antiga.quantidade_sistema));
      if (novoSaldo < 0) falha(`Estoque de ${produto.nome} ficaria negativo (${qtd(novoSaldo)}).`);

      const { data: linhas, error } = await supabase
        .from("contagens_estoque")
        .update({ data: dataValida(data), quantidade_contada: contada, observacao: (observacao ?? "").trim() || null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!linhas?.length) falha("Contagem não encontrada ou sem permissão para editar.");
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

export async function excluirContagem(id) {
  return executar(
    async (supabase) => {
      const { data: antiga, error: erroContagem } = await supabase.from("contagens_estoque").select("produto_id, diferenca").eq("id", id).single();
      if (erroContagem || !antiga) falha("Contagem não encontrada.");
      const produto = await saldoDoProduto(supabase, antiga.produto_id);
      const novoSaldo = produto.saldo - Number(antiga.diferenca);
      if (novoSaldo < 0) falha(`Estoque de ${produto.nome} ficaria negativo (${qtd(novoSaldo)}).`);
      const { error } = await supabase.from("contagens_estoque").delete().eq("id", id);
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

// ---------- Sessão ----------

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
