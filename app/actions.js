"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { clienteDaVenda } from "../lib/crm";
import { numero, preenchido, qtd } from "../lib/formato";
import { ABERTOS, avisoStatus, mudancaValida } from "../lib/pedido";
import { avisarCliente } from "../lib/push";
import { motivoDaContagem } from "../lib/resumo";
import { ehEquipe } from "../lib/rotas";
import { criarAdmin } from "../lib/supabase/admin";
import { createClient, usuarioAtual } from "../lib/supabase/server";
import { validarVendedor } from "../lib/vendedores";
import { motivoSemAcessoVenda } from "../lib/vendas";

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
    // ações deste arquivo são da equipe; cliente tem as dele em app/conta e app/loja (a RLS também barra)
    if (!ehEquipe(user)) falha("Sem acesso.");
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

// data da 1ª parcela da venda no cartão; vazio = padrão do banco (dia 8 do mês seguinte)
function vencimentoOpcional(pagamento, texto) {
  if (pagamento !== "cartao" || !texto) return null;
  return dataValida(texto);
}

// despesa/compra: sem cartão = à vista (1 parcela); no cartão, 1 a 12x. Cartão desativado só vale
// se já era o da linha (editar um lançamento antigo não obriga a trocar de cartão)
async function formaDePagamento(supabase, cartaoId, parcelas, cartaoAtual = null) {
  if (!cartaoId) return { cartao_id: null, parcelas: 1 };
  if (!UUID.test(cartaoId)) falha("Cartão inválido.");
  const { data: cartao } = await supabase.from("cartoes").select("ativo").eq("id", cartaoId).maybeSingle();
  if (!cartao || (!cartao.ativo && cartaoId !== cartaoAtual)) falha("Cartão não encontrado ou desativado.");
  return { cartao_id: cartaoId, parcelas: parcelasValidas("cartao", parcelas) };
}

function diaDoCartao(texto, nome) {
  const n = Number(texto);
  if (!Number.isInteger(n) || n < 1 || n > 28) falha(`Dia de ${nome} inválido (1 a 28).`);
  return n;
}

function atualizarTudo() {
  ["/vendas", "/estoque", "/saidas", "/resumos"].forEach((p) => revalidatePath(p));
}

// ---------- Vendas ----------

// itens: [{ produtoId, quantidade, preco }]; pagamento, parcelas, data e obs valem para a venda toda.
// Cada item vira uma linha em `vendas`, ligadas por grupo_id quando há mais de um.
// pedidoId: venda lançada a partir de um pedido da loja (vitrine); o pedido fica "entregue" e ligado à venda.
// cliente { nome, telefone }: opcional (mig. 038); com pedido, vale o nome/WhatsApp digitado e a conta vem do pedido.
export async function registrarVenda({ itens, pagamento, parcelas, primeiroVencimento, data, obs, pedidoId, cliente }) {
  return executar(async (supabase, user) => {
    if (!Array.isArray(itens) || itens.length === 0) falha("Adicione ao menos um item.");
    let ped = null;
    if (pedidoId) {
      if (!UUID.test(pedidoId)) falha("Pedido inválido.");
      ({ data: ped } = await supabase.from("pedidos").select("numero, status, cliente_id, cliente_nome, cliente_telefone").eq("id", pedidoId).single());
      if (!ped) falha("Pedido não encontrado.");
      if (!ABERTOS.includes(ped.status)) falha("Este pedido já foi entregue ou cancelado.");
    }
    const cli = clienteDaVenda(cliente ?? (ped ? { nome: ped.cliente_nome, telefone: ped.cliente_telefone } : {}));
    if (cli.erro) falha(cli.erro);
    if (itens.length > 30) falha("Itens demais numa venda (máximo 30).");
    if (!PAGAMENTOS.includes(pagamento)) falha("Escolha a forma de pagamento.");
    const nParcelas = parcelasValidas(pagamento, parcelas);
    const venc = vencimentoOpcional(pagamento, primeiroVencimento);

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
          primeiro_vencimento: venc,
          obs: (obs ?? "").trim() || null,
          grupo_id: grupoId,
          cliente_nome: cli.cliente_nome,
          cliente_telefone: cli.cliente_telefone,
          // a conta do cliente só vem do pedido (nunca do navegador)
          cliente_id: ped?.cliente_id ?? null,
        })),
      )
      .select("id");
    // P0001 = mensagem escrita para o usuário dentro do banco (ex.: o saldo acabou entre a conferência e o insert)
    if (error?.code === "P0001") falha(error.message);
    if (error) throw error;
    if (ped) {
      // a venda já entrou; se marcar o pedido falhar, ele só continua aberto na lista
      const agora = new Date().toISOString();
      const { error: erroPedido } = await supabase
        .from("pedidos")
        .update({ status: "entregue", status_em: agora, venda_ref: grupoId ?? gravadas?.[0]?.id ?? null, atendido_por: user.id, atendido_em: agora })
        .eq("id", pedidoId);
      if (erroPedido) console.error(erroPedido);
      else after(() => avisarCliente(ped.cliente_id, { ...avisoStatus(ped.numero, "entregue"), url: "/conta", tag: `pedido-${ped.numero}` }));
    }
    atualizarTudo();
  });
}

// WhatsApp digitado na venda → nome do cliente na venda ou pedido mais recente com esse número (sugestão)
export async function nomeDoCliente(telefone) {
  return executar(async (supabase) => {
    const { cliente_telefone: t } = clienteDaVenda({ telefone });
    if (!t) return { nome: null };
    const [{ data: venda }, { data: ped }] = await Promise.all([
      supabase.from("vendas").select("cliente_nome, created_at").eq("cliente_telefone", t).not("cliente_nome", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("pedidos").select("cliente_nome, criado_em").eq("cliente_telefone", t).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const nome = !venda ? ped?.cliente_nome : !ped || venda.created_at > ped.criado_em ? venda.cliente_nome : ped.cliente_nome;
    return { nome: nome ?? null };
  });
}

// Andamento do pedido da loja: confirmado → pronto → entregue, cancelar, ou reabrir um cancelado.
// O cliente com conta recebe o aviso no celular.
export async function atualizarPedido({ id, status }) {
  return executar(async (supabase, user) => {
    if (!UUID.test(id ?? "")) falha("Pedido inválido.");
    const { data: ped } = await supabase.from("pedidos").select("numero, status, cliente_id").eq("id", id).single();
    if (!ped) falha("Pedido não encontrado.");
    if (!mudancaValida(ped.status, status)) falha(ped.status === "entregue" ? "Pedido já entregue: exclua a venda para desfazer." : "Mudança de situação inválida.");
    const agora = new Date().toISOString();
    const campos = status === "novo" ? { status, status_em: agora, atendido_por: null, atendido_em: null, venda_ref: null } : { status, status_em: agora, atendido_por: user.id, atendido_em: agora };
    // .eq no status antigo: dois vendedores mexendo ao mesmo tempo não atropelam um ao outro
    const { data: salvos, error } = await supabase.from("pedidos").update(campos).eq("id", id).eq("status", ped.status).select("id");
    if (error) throw error;
    if (!salvos?.length) falha("O pedido mudou enquanto você mexia. Atualize a tela.");
    after(() => avisarCliente(ped.cliente_id, { ...avisoStatus(ped.numero, status), url: "/conta", tag: `pedido-${ped.numero}` }));
    revalidatePath("/vendas");
    revalidatePath("/conta");
  });
}

// Vendedor e sócia mexem só na própria venda, até 48 h depois de lançada; depois, só o gerente (lib/vendas.js).
// O banco aplica a mesma regra (policy pode_mexer_venda); aqui é para dar a mensagem certa.
function conferirAcessoVenda(user, vendas) {
  for (const v of vendas) {
    const motivo = motivoSemAcessoVenda({ papel: user.app_metadata?.papel, usuarioId: user.id, vendedorId: v.vendedor_id, criadaEm: v.created_at });
    if (motivo) falha(motivo);
  }
}

// cliente { nome, telefone } (opcional): o cliente é da venda toda, então vale para todos os itens do grupo
export async function editarVenda({ id, quantidade, preco, pagamento, parcelas, primeiroVencimento, data, obs, cliente }) {
  return executar(async (supabase, user) => {
    if (!UUID.test(id ?? "")) falha("Venda inválida.");
    const q = valorPositivo(quantidade, "a quantidade");
    const p = valorPositivo(preco, "o preço");
    if (!PAGAMENTOS.includes(pagamento)) falha("Escolha a forma de pagamento.");
    const nParcelas = parcelasValidas(pagamento, parcelas);
    const venc = vencimentoOpcional(pagamento, primeiroVencimento);
    const cli = cliente === undefined ? null : clienteDaVenda(cliente);
    if (cli?.erro) falha(cli.erro);

    const { data: antiga, error: erroVenda } = await supabase.from("vendas").select("produto_id, quantidade, vendedor_id, created_at, grupo_id").eq("id", id).single();
    if (erroVenda || !antiga) falha("Venda não encontrada.");
    conferirAcessoVenda(user, [antiga]);

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
        primeiro_vencimento: venc,
        obs: (obs ?? "").trim() || null,
      })
      .eq("id", id)
      .select("id");
    if (error?.code === "P0001") falha(error.message);
    if (error) throw error;
    if (!salvas?.length) falha("Você não pode editar esta venda.");
    if (cli) {
      const { error: erroCliente } = await supabase
        .from("vendas")
        .update({ cliente_nome: cli.cliente_nome, cliente_telefone: cli.cliente_telefone })
        .or(antiga.grupo_id ? `id.eq.${id},grupo_id.eq.${antiga.grupo_id}` : `id.eq.${id}`);
      if (erroCliente) throw erroCliente;
    }
    atualizarTudo();
  });
}

// `id` é o de uma venda ou o grupo_id de uma venda com vários itens (apaga todos os itens)
export async function excluirVenda(id) {
  return executar(async (supabase, user) => {
    if (!UUID.test(id ?? "")) falha("Venda inválida.");
    const filtro = `id.eq.${id},grupo_id.eq.${id}`;
    // a exclusão é lógica (o DELETE não devolve linhas), então a conferência de quem pode vem antes
    const { data: itens, error: erroBusca } = await supabase.from("vendas").select("vendedor_id, created_at").or(filtro);
    if (erroBusca) throw erroBusca;
    if (!itens?.length) falha("Venda não encontrada.");
    conferirAcessoVenda(user, itens);
    const { error } = await supabase.from("vendas").delete().or(filtro);
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

// Só o gerente lança e exclui compra: ela mexe no estoque e no custo médio, que vira o custo (e a comissão) das vendas seguintes.
export async function registrarCompra({ produtoId, quantidade, custo, fornecedor, data, cartaoId, parcelas }) {
  return executar(
    async (supabase) => {
      if (!produtoId) falha("Escolha o produto.");
      const q = valorPositivo(quantidade, "a quantidade");
      const c = valorPositivo(custo, "o custo unitário", { permiteZero: true });
      const pagamento = await formaDePagamento(supabase, cartaoId, parcelas);

      // o custo do produto é recalculado automaticamente (trigger) como a média
      // ponderada de todas as compras; vendas antigas guardam o custo da época
      const { error } = await supabase.from("compras").insert({
        data: dataValida(data),
        produto_id: produtoId,
        quantidade: q,
        custo_unit: c,
        fornecedor: (fornecedor ?? "").trim() || null,
        ...pagamento,
      });
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

// Só o gerente edita compra (data, quantidade, custo, fornecedor); o custo médio é refeito por trigger.
export async function editarCompra({ id, quantidade, custo, fornecedor, data, cartaoId, parcelas }) {
  return executar(
    async (supabase) => {
      const q = valorPositivo(quantidade, "a quantidade");
      const c = valorPositivo(custo, "o custo unitário", { permiteZero: true });
      const { data: antiga, error: erroCompra } = await supabase.from("compras").select("produto_id, quantidade, cartao_id").eq("id", id).single();
      if (erroCompra || !antiga) falha("Compra não encontrada.");
      const pagamento = await formaDePagamento(supabase, cartaoId, parcelas, antiga.cartao_id);

      // diminuir a compra tira mercadoria do estoque: não pode deixar o saldo negativo
      const produto = await saldoDoProduto(supabase, antiga.produto_id);
      const novoSaldo = produto.saldo - Number(antiga.quantidade) + q;
      if (novoSaldo < 0) falha(`Estoque de ${produto.nome} ficaria negativo (${qtd(novoSaldo)}). Já foi vendido mais do que isso.`);

      const { data: linhas, error } = await supabase
        .from("compras")
        .update({ data: dataValida(data), quantidade: q, custo_unit: c, fornecedor: (fornecedor ?? "").trim() || null, ...pagamento })
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
  return executar(
    async (supabase) => {
      if (!UUID.test(id ?? "")) falha("Compra inválida.");
      const { error } = await supabase.from("compras").delete().eq("id", id);
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

// ---------- Despesas ----------

export async function registrarDespesa({ tipo, descricao, valor, data, cartaoId, parcelas }) {
  return executar(
    async (supabase) => {
      if (!TIPOS_DESPESA.includes(tipo)) falha("Escolha o tipo da despesa.");
      const v = valorPositivo(valor, "o valor");
      const pagamento = await formaDePagamento(supabase, cartaoId, parcelas);
      const { error } = await supabase.from("despesas").insert({
        data: dataValida(data),
        tipo,
        descricao: (descricao ?? "").trim() || null,
        valor: v,
        ...pagamento,
      });
      if (error) throw error;
      atualizarTudo();
    },
    { exigeGerente: true },
  );
}

export async function editarDespesa({ id, tipo, descricao, valor, data, cartaoId, parcelas }) {
  return executar(
    async (supabase) => {
      if (!TIPOS_DESPESA.includes(tipo)) falha("Escolha o tipo da despesa.");
      const v = valorPositivo(valor, "o valor");
      const { data: atual } = await supabase.from("despesas").select("cartao_id").eq("id", id).maybeSingle();
      if (!atual) falha("Despesa não encontrada.");
      const pagamento = await formaDePagamento(supabase, cartaoId, parcelas, atual.cartao_id);
      const { data: linhas, error } = await supabase
        .from("despesas")
        .update({
          data: dataValida(data),
          tipo,
          descricao: (descricao ?? "").trim() || null,
          valor: v,
          ...pagamento,
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

// ---------- Cartões (despesa/compra no cartão sai do caixa no vencimento da fatura) ----------

export async function registrarCartao({ nome, fechamento, vencimento }) {
  return executar(
    async (supabase) => {
      if (!preenchido(nome)) falha("Informe o nome do cartão.");
      const { error } = await supabase.from("cartoes").insert({
        nome: nome.trim(),
        dia_fechamento: diaDoCartao(fechamento, "fechamento"),
        dia_vencimento: diaDoCartao(vencimento, "vencimento"),
      });
      if (error) throw error;
      revalidatePath("/saidas");
      revalidatePath("/estoque");
    },
    { exigeGerente: true },
  );
}

// mudar os dias não refaz o que já foi lançado (as parcelas ficam como foram calculadas)
export async function editarCartao({ id, nome, fechamento, vencimento, ativo }) {
  return executar(
    async (supabase) => {
      if (!preenchido(nome)) falha("Informe o nome do cartão.");
      const { data: linhas, error } = await supabase
        .from("cartoes")
        .update({
          nome: nome.trim(),
          dia_fechamento: diaDoCartao(fechamento, "fechamento"),
          dia_vencimento: diaDoCartao(vencimento, "vencimento"),
          ativo: Boolean(ativo),
        })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!linhas?.length) falha("Cartão não encontrado ou sem permissão para editar.");
      revalidatePath("/saidas");
      revalidatePath("/estoque");
    },
    { exigeGerente: true },
  );
}

// ---------- Vendedores (gerente e sócia) ----------

async function exigeGerenteOuSocia(supabase) {
  const usuario = await usuarioAtual(supabase);
  if (!usuario?.gerente && usuario?.papel !== "socia") falha("Só o gerente ou a sócia cadastram vendedor.");
}

// papel e comissão só mudam pela service role (o usuário não tem grant nessas colunas);
// a faixa de 10–40% também é conferida no banco (perfis_comissao_vendedor)
function adminOuFalha() {
  const admin = criarAdmin();
  if (!admin) falha("Cadastro indisponível: falta configurar a chave do servidor.");
  return admin;
}

export async function cadastrarVendedor(dados) {
  return executar(async (supabase) => {
    await exigeGerenteOuSocia(supabase);
    const v = validarVendedor(dados);
    if (v.erro) falha(v.erro);
    const admin = adminOuFalha();

    const { data, error } = await admin.auth.admin.createUser({
      email: v.email,
      password: v.senha,
      email_confirm: true,
      user_metadata: { nome: v.nome, telefone: v.telefone },
      // o gatilho cria o perfil com o papel do app_metadata (mig. 031)
      app_metadata: { papel: "vendedor" },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) falha("Já existe uma conta com esse e-mail.");
      throw error;
    }
    const { error: e2 } = await admin.from("perfis").update({ papel: "vendedor", nome: v.nome, telefone: v.telefone, comissao_pct: v.comissao_pct }).eq("id", data.user.id);
    if (e2) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw e2;
    }
    revalidatePath("/vendedores");
  });
}

// muda só as próximas vendas (o % é fotografado em cada venda); gerente, sócia e cliente não passam por aqui
export async function editarVendedor({ id, ...dados }) {
  return executar(async (supabase) => {
    await exigeGerenteOuSocia(supabase);
    if (!UUID.test(id ?? "")) falha("Vendedor inválido.");
    const v = validarVendedor(dados, { novo: false });
    if (v.erro) falha(v.erro);
    const { data: linhas, error } = await adminOuFalha().from("perfis").update(v).eq("id", id).eq("papel", "vendedor").select("id");
    if (error) throw error;
    if (!linhas?.length) falha("Vendedor não encontrado.");
    revalidatePath("/vendedores");
    revalidatePath("/vendas");
    revalidatePath("/resumos");
  });
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
// O "que o sistema achava" (quantidade_sistema) é calculado pelo banco na hora de gravar, não vem do navegador.
// motivo (mig. 039): perda, quebra, erro ou outro; obrigatório quando a contagem tem diferença.
export async function registrarContagem({ produtoId, quantidade, observacao, data, motivo }) {
  return executar(async (supabase) => {
    // contagem é de gerente e sócia (o vendedor nem vê a aba); o banco também barra (mig. 037)
    const usuario = await usuarioAtual(supabase);
    if (!usuario?.gerente && usuario?.papel !== "socia") falha("Só o gerente ou a sócia registram contagem.");
    if (!produtoId) falha("Escolha o produto.");
    const contada = valorPositivo(quantidade, "a quantidade contada", {
      permiteZero: true,
    });
    const produto = await saldoDoProduto(supabase, produtoId);
    // a diferença de verdade é do banco (contagens_preencher); esta é só para exigir o motivo
    const m = motivoDaContagem(contada - Number(produto.saldo), motivo);
    if (m.erro) falha(m.erro);

    const { error } = await supabase.from("contagens_estoque").insert({
      data: dataValida(data),
      produto_id: produtoId,
      quantidade_contada: contada,
      observacao: (observacao ?? "").trim() || null,
      motivo: m.motivo,
    });
    if (error) throw error;
    atualizarTudo();
  });
}

// Só o gerente edita ou exclui contagem. quantidade_sistema é a fotografia do momento; só a contada muda
// (a diferença é recalculada). Nenhuma das duas pode deixar o estoque negativo.
export async function editarContagem({ id, quantidade, observacao, data, motivo }) {
  return executar(
    async (supabase) => {
      const contada = valorPositivo(quantidade, "a quantidade contada", { permiteZero: true });
      const { data: antiga, error: erroContagem } = await supabase.from("contagens_estoque").select("produto_id, quantidade_sistema, diferenca").eq("id", id).single();
      if (erroContagem || !antiga) falha("Contagem não encontrada.");
      const m = motivoDaContagem(contada - Number(antiga.quantidade_sistema), motivo);
      if (m.erro) falha(m.erro);

      const produto = await saldoDoProduto(supabase, antiga.produto_id);
      const novoSaldo = produto.saldo - Number(antiga.diferenca) + (contada - Number(antiga.quantidade_sistema));
      if (novoSaldo < 0) falha(`Estoque de ${produto.nome} ficaria negativo (${qtd(novoSaldo)}).`);

      const { data: linhas, error } = await supabase
        .from("contagens_estoque")
        .update({ data: dataValida(data), quantidade_contada: contada, observacao: (observacao ?? "").trim() || null, motivo: m.motivo })
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
