"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { numero, preenchido, qtd } from "../lib/formato";
import { createClient, usuarioAtual } from "../lib/supabase/server";

const PAGAMENTOS = ["a_vista", "cartao"];
const TIPOS_DESPESA = ["aluguel", "agua", "luz", "internet", "gasolina", "alimentacao", "pedagio", "outros"];
const TIPOS_LANCAMENTO = ["pro_labore", "pagamento_comissao", "saque", "aporte", "capital_inicial", "repasse"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const BUCKET_FOTOS = "fotos";

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
    const extra = await fn(supabase, user);
    return { ok: true, ...extra };
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

// itens: [{ produtoId, quantidade, preco }]; pagamento, parcelas, data e obs valem para a venda toda.
// Cada item vira uma linha em `vendas`, ligadas por grupo_id quando há mais de um.
// pedidoId: venda lançada a partir de um pedido da loja (vitrine); o pedido fica "atendido" e ligado à venda.
export async function registrarVenda({ itens, pagamento, parcelas, data, obs, pedidoId }) {
  return executar(async (supabase, user) => {
    if (!Array.isArray(itens) || itens.length === 0) falha("Adicione ao menos um item.");
    if (pedidoId) {
      if (!UUID.test(pedidoId)) falha("Pedido inválido.");
      const { data: ped } = await supabase.from("pedidos").select("status").eq("id", pedidoId).single();
      if (!ped) falha("Pedido não encontrado.");
      if (ped.status !== "novo") falha("Este pedido já foi atendido ou cancelado.");
    }
    if (itens.length > 30) falha("Itens demais numa venda (máximo 30).");
    if (!PAGAMENTOS.includes(pagamento)) falha("Escolha a forma de pagamento.");
    const nParcelas = parcelasValidas(pagamento, parcelas);

    const linhas = itens.map((i) => {
      if (!i.produtoId) falha("Escolha o produto.");
      return { produtoId: i.produtoId, q: valorPositivo(i.quantidade, "a quantidade"), p: valorPositivo(i.preco, "o preço") };
    });

    // o mesmo produto pode aparecer em mais de um item: o saldo vale para a soma
    const pedido = new Map();
    for (const l of linhas) pedido.set(l.produtoId, (pedido.get(l.produtoId) ?? 0) + l.q);
    for (const [produtoId, q] of pedido) {
      const produto = await saldoDoProduto(supabase, produtoId);
      if (!produto.ativo) falha(`${produto.nome} está inativo.`);
      if (q > produto.saldo) falha(`Estoque insuficiente de ${produto.nome}: restam ${qtd(produto.saldo)}.`);
    }

    const grupoId = linhas.length > 1 ? crypto.randomUUID() : null;
    const dataVenda = dataValida(data);
    // um único insert: ou entram todos os itens, ou nenhum
    const { data: gravadas, error } = await supabase
      .from("vendas")
      .insert(
        linhas.map((l) => ({
          data: dataVenda,
          produto_id: l.produtoId,
          quantidade: l.q,
          preco_unit: l.p,
          pagamento,
          parcelas: nParcelas,
          obs: (obs ?? "").trim() || null,
          grupo_id: grupoId,
        })),
      )
      .select("id");
    if (error) throw error;
    if (pedidoId) {
      // a venda já entrou; se marcar o pedido falhar, ele só continua aparecendo como novo
      const { error: erroPedido } = await supabase
        .from("pedidos")
        .update({ status: "atendido", venda_ref: grupoId ?? gravadas?.[0]?.id ?? null, atendido_por: user.id, atendido_em: new Date().toISOString() })
        .eq("id", pedidoId);
      if (erroPedido) console.error(erroPedido);
    }
    atualizarTudo();
  });
}

// Cancela um pedido da loja (cliente desistiu, pedido de teste...) ou o reabre como novo
export async function atualizarPedido({ id, status }) {
  return executar(async (supabase, user) => {
    if (!UUID.test(id ?? "")) falha("Pedido inválido.");
    if (!["novo", "cancelado"].includes(status)) falha("Situação inválida.");
    const campos = status === "cancelado" ? { status, atendido_por: user.id, atendido_em: new Date().toISOString() } : { status, atendido_por: null, atendido_em: null, venda_ref: null };
    const { data: salvos, error } = await supabase.from("pedidos").update(campos).eq("id", id).neq("status", "atendido").select("id");
    if (error) throw error;
    if (!salvos?.length) falha("Pedido já atendido: exclua a venda para desfazer.");
    revalidatePath("/vendas");
  });
}

export async function editarVenda({ id, quantidade, preco, pagamento, parcelas, data, obs }) {
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
        obs: (obs ?? "").trim() || null,
      })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!salvas?.length) falha("Você não pode editar esta venda.");
    atualizarTudo();
  });
}

// `id` é o de uma venda ou o grupo_id de uma venda com vários itens (apaga todos os itens)
export async function excluirVenda(id) {
  return executar(async (supabase) => {
    if (!UUID.test(id ?? "")) falha("Venda inválida.");
    const { error } = await supabase.from("vendas").delete().or(`id.eq.${id},grupo_id.eq.${id}`);
    if (error) throw error;
    atualizarTudo();
  });
}

// ---------- Produtos ----------

// só aceita foto do nosso bucket (a vitrine pública mostra o endereço gravado aqui)
function fotoValida(url) {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (!u.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`)) falha("Foto inválida.");
  return u;
}

// Custo e preço são obrigatórios: sem os dois o produto não é salvo.
export async function salvarProduto({ id, nome, unidade, custo, preco, ativo = true, categoriaId, fotoUrl, descricao }) {
  return executar(
    async (supabase) => {
      const n = (nome ?? "").trim();
      if (!n) falha("Informe o nome do produto.");
      const desc = (descricao ?? "").trim();
      if (desc.length > 500) falha("Descrição longa demais (máximo 500 letras).");
      if (categoriaId && !UUID.test(categoriaId)) falha("Categoria inválida.");
      const campos = {
        nome: n,
        unidade: (unidade ?? "").trim() || "un",
        ativo: Boolean(ativo),
        custo: valorPositivo(custo, "o custo", { permiteZero: true }),
        preco: valorPositivo(preco, "o preço"),
        categoria_id: categoriaId || null,
        foto_url: fotoValida(fotoUrl),
        descricao: desc || null,
      };

      const { error } = id ? await supabase.from("produtos").update(campos).eq("id", id) : await supabase.from("produtos").insert(campos);
      if (error?.code === "23505") falha("Já existe um produto com esse nome.");
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

// ---------- Categorias e fotos (vitrine) ----------

export async function salvarCategoria({ id, nome, ordem, fotoUrl, ativo = true }) {
  return executar(
    async (supabase) => {
      const n = (nome ?? "").trim();
      if (!n) falha("Informe o nome da categoria.");
      if (n.length > 60) falha("Nome longo demais (máximo 60 letras).");
      const o = preenchido(ordem) ? Number(ordem) : 0;
      if (!Number.isInteger(o) || o < 0 || o > 999) falha("Ordem inválida (0 a 999).");
      const campos = { nome: n, ordem: o, foto_url: fotoValida(fotoUrl), ativo: Boolean(ativo) };

      const { error } = id ? await supabase.from("categorias").update(campos).eq("id", id) : await supabase.from("categorias").insert(campos);
      if (error?.code === "23505") falha("Já existe uma categoria com esse nome.");
      if (error) throw error;
      atualizarTudo();
      revalidatePath("/");
    },
    { exigeGerente: true },
  );
}

// os produtos da categoria ficam sem categoria ("Outros")
export async function excluirCategoria(id) {
  return executar(
    async (supabase) => {
      if (!UUID.test(id ?? "")) falha("Categoria inválida.");
      const { error } = await supabase.from("categorias").delete().eq("id", id);
      if (error) throw error;
      atualizarTudo();
      revalidatePath("/");
    },
    { exigeGerente: true },
  );
}

const TIPOS_FOTO = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

// Recebe a foto já reduzida no navegador (lib/imagem.js) e devolve o endereço público no bucket.
export async function enviarFoto(formData) {
  return executar(
    async (supabase) => {
      const arquivo = formData?.get?.("foto");
      if (!arquivo || typeof arquivo === "string") falha("Escolha uma foto.");
      const ext = TIPOS_FOTO[arquivo.type];
      if (!ext) falha("Formato de foto não aceito (use JPG, PNG ou WebP).");
      if (arquivo.size > 2 * 1024 * 1024) falha("Foto grande demais (máximo 2 MB).");
      const pasta = formData.get("pasta") === "categorias" ? "categorias" : "produtos";
      const caminho = `${pasta}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: "31536000" });
      if (error) throw error;
      return { url: supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho).data.publicUrl };
    },
    { exigeGerente: true },
  );
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
