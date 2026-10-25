"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { nomeDoCliente, registrarVenda } from "../app/actions";
import { brl, dataBR, hoje, numero, preenchido, qtd } from "../lib/formato";
import { primeiroVencimentoVenda } from "../lib/parcelas";
import { formatarTelefone, telefoneValido } from "../lib/pedido";
import useEnvio, { Mensagem } from "./useEnvio";

const FORMAS = [
  ["a_vista", "À Vista"],
  ["cartao", "Cartão"],
];

// itens de um pedido da loja já no lote, com o preço do pedido (o vendedor ainda pode remover)
function loteDoPedido(pedido, produtos) {
  if (!pedido) return [];
  return pedido.itens.flatMap((i) => {
    const p = produtos.find((x) => x.id === i.produto_id);
    if (!p) return [];
    return [{ produtoId: p.id, quantidade: String(i.quantidade), preco: String(i.preco), nome: p.nome, unidade: p.unidade, q: Number(i.quantidade), pr: Number(i.preco), custo: p.custo, tabela: p.preco }];
  });
}

export default function FormVenda({ produtos, comissaoPct, mostraLucro = false, pedido = null }) {
  const router = useRouter();
  const { salvando, msg, enviar, limpar } = useEnvio();
  const [lote, setLote] = useState(() => loteDoPedido(pedido, produtos)); // itens já adicionados à venda
  const faltando = pedido ? pedido.itens.filter((i) => !produtos.some((p) => p.id === i.produto_id)) : [];
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [preco, setPreco] = useState("");
  const [pagamento, setPagamento] = useState("a_vista");
  const [parcelas, setParcelas] = useState("1");
  const [data, setData] = useState("");
  const [venc, setVenc] = useState(""); // vazio = padrão (dia 8 do mês seguinte)
  const [obs, setObs] = useState(pedido ? `Pedido nº ${pedido.numero}` : "");
  // cliente opcional (CRM); a venda de um pedido já vem com o cliente do pedido
  const [cliNome, setCliNome] = useState(pedido?.cliente_nome ?? "");
  const [cliTel, setCliTel] = useState(pedido?.cliente_telefone ? formatarTelefone(pedido.cliente_telefone) : "");

  // WhatsApp conhecido e nome vazio: sugere o nome da última venda/pedido com esse número
  async function sugerirNome() {
    if (cliNome.trim() || !telefoneValido(cliTel)) return;
    const r = await nomeDoCliente(cliTel);
    if (r?.ok && r.nome) setCliNome((atual) => atual || r.nome);
  }

  // data local só no navegador (o servidor roda em UTC)
  useEffect(() => setData(hoje()), []);

  const produto = produtos.find((p) => p.id === produtoId);

  function escolher(id) {
    setProdutoId(id);
    const p = produtos.find((x) => x.id === id);
    setPreco(p ? String(p.preco) : "");
    limpar();
  }

  const q = numero(quantidade);
  const pr = numero(preco);
  const itemValido = Boolean(produto) && preenchido(quantidade) && preenchido(preco) && q > 0 && pr > 0;
  const atual = itemValido ? { produtoId, quantidade, preco, nome: produto.nome, unidade: produto.unidade, q, pr, custo: produto.custo, tabela: produto.preco } : null;
  // venda = itens do lote + o que está nos campos
  const itens = atual ? [...lote, atual] : lote;
  const valido = itens.length > 0;
  const total = itens.reduce((t, i) => t + i.q * i.pr, 0);
  // desconto = preço cadastrado − preço vendido (negativo = vendeu acima da tabela)
  const tabelaTotal = itens.reduce((t, i) => t + i.tabela * i.q, 0);
  const desconto = tabelaTotal - total;
  const descontoPct = tabelaTotal > 0 ? (desconto / tabelaTotal) * 100 : 0;
  const lucro = itens.reduce((t, i) => t + (i.pr - i.custo) * i.q, 0);
  // comissão por item: prejuízo de um item não abate o lucro de outro
  const comissao = itens.reduce((t, i) => t + Math.max((i.pr - i.custo) * i.q, 0), 0) * (comissaoPct / 100);
  const nParcelas = pagamento === "cartao" ? Number(parcelas) : 1;

  function limparItem() {
    setProdutoId("");
    setQuantidade("1");
    setPreco("");
  }

  function adicionarItem() {
    if (!atual) return;
    setLote([...lote, atual]);
    limparItem();
    limpar();
  }

  async function enviarVenda(e) {
    e.preventDefault();
    await enviar(
      registrarVenda,
      {
        itens: itens.map(({ produtoId, quantidade, preco }) => ({ produtoId, quantidade, preco })),
        pagamento,
        parcelas: nParcelas,
        primeiroVencimento: venc,
        data,
        obs,
        pedidoId: pedido?.id,
        cliente: { nome: cliNome, telefone: cliTel },
      },
      {
        textoOk: itens.length > 1 ? `Venda registrada (${itens.length} itens)!` : "Venda registrada!",
        aoConcluir: () => {
          setLote([]);
          limparItem();
          setParcelas("1");
          setVenc("");
          setObs("");
          setCliNome("");
          setCliTel("");
          if (pedido) router.replace("/vendas"); // sai do modo pedido
        },
      },
    );
  }

  if (produtos.length === 0) {
    return (
      <div className="card">
        <p className="vazio">Nenhum produto com estoque. Cadastre produtos e lance uma compra na aba Estoque / Saídas.</p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={enviarVenda}>
      {pedido && (
        <p className="info" style={{ marginTop: 0 }}>
          Lançando o <strong>pedido nº {pedido.numero}</strong> de {pedido.cliente_nome}. Confira itens, preço e pagamento antes de registrar.
        </p>
      )}
      {faltando.map((i) => (
        <p key={i.produto_id} className="alerta">
          {i.nome} está sem estoque ou inativo e ficou fora da venda.
        </p>
      ))}
      {lote.length > 0 && (
        <ul className="lista" style={{ marginBottom: 12 }}>
          {lote.map((i, idx) => (
            <li key={idx}>
              <div>
                <div className="titulo">{i.nome}</div>
                <div className="sub">
                  {qtd(i.q)} {i.unidade} × {brl(i.pr)}
                </div>
              </div>
              <div className="valor">{brl(i.q * i.pr)}</div>
              <button type="button" className="botao-secundario" onClick={() => setLote(lote.filter((_, j) => j !== idx))} aria-label={`Remover ${i.nome}`}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor="produto">{lote.length > 0 ? "Outro item" : "Produto"}</label>
      <select id="produto" value={produtoId} onChange={(e) => escolher(e.target.value)} required={lote.length === 0}>
        <option value="">Escolha...</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome} ({qtd(p.saldo)} {p.unidade})
          </option>
        ))}
      </select>

      <div className="linha-2">
        <div>
          <label htmlFor="qtd">Quantidade</label>
          <input id="qtd" type="number" inputMode="decimal" step="any" min="0" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required={lote.length === 0} />
        </div>
        <div>
          <label htmlFor="preco">Preço unit. (R$)</label>
          <input id="preco" type="number" inputMode="decimal" step="0.01" min="0" value={preco} onChange={(e) => setPreco(e.target.value)} required={lote.length === 0} />
        </div>
      </div>

      <button type="button" className="botao-secundario" disabled={!itemValido} onClick={adicionarItem}>
        + Adicionar outro item
      </button>

      <label>Pagamento</label>
      <div className="segmentos" style={{ marginBottom: 0 }}>
        {FORMAS.map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            className={pagamento === valor ? "ativo" : ""}
            onClick={() => {
              setPagamento(valor);
              if (valor !== "cartao") setParcelas("1");
            }}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {pagamento === "cartao" && (
        <>
          <label htmlFor="parcelas">Parcelas</label>
          <select id="parcelas" value={parcelas} onChange={(e) => setParcelas(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}x{valido ? ` de ${brl(total / n)}` : ""}
              </option>
            ))}
          </select>
          <label htmlFor="venc">1ª parcela vence em</label>
          <input id="venc" type="date" value={venc || (data ? primeiroVencimentoVenda(data) : "")} onChange={(e) => setVenc(e.target.value)} required />
          <span className="info">As demais vencem no mesmo dia, mês a mês{venc || data ? `, a partir de ${dataBR(venc || primeiroVencimentoVenda(data))}` : ""}.</span>
        </>
      )}

      <label htmlFor="data">Data</label>
      <input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />

      <label htmlFor="cli-tel">WhatsApp do cliente (opcional)</label>
      <input id="cli-tel" type="tel" inputMode="tel" autoComplete="off" maxLength={20} placeholder="(54) 98888-1234" value={cliTel} onChange={(e) => setCliTel(e.target.value)} onBlur={sugerirNome} />

      <label htmlFor="cli-nome">Nome do cliente (opcional)</label>
      <input id="cli-nome" type="text" autoComplete="off" maxLength={80} value={cliNome} onChange={(e) => setCliNome(e.target.value)} />
      <span className="info">Com o cliente, a venda entra no histórico dele (CRM).</span>

      <label htmlFor="obs">Obs (opcional)</label>
      <input id="obs" type="text" maxLength={200} value={obs} onChange={(e) => setObs(e.target.value)} />

      {valido && (
        <div className="resumo-venda">
          <div>
            <span>Total</span>
            <strong>{brl(total)}</strong>
          </div>
          <div>
            <span>Desconto ({qtd(Math.round(descontoPct * 10) / 10)}%)</span>
            <strong className={desconto > 0.005 ? "negativo" : undefined}>{brl(desconto)}</strong>
          </div>
          {mostraLucro && (
            <div>
              <span>Lucro</span>
              <strong className={lucro < 0 ? "negativo" : "positivo"}>{brl(lucro)}</strong>
            </div>
          )}
          <div>
            <span>Sua comissão ({qtd(comissaoPct)}%)</span>
            <strong>{brl(comissao)}</strong>
          </div>
          {nParcelas > 1 && (
            <span className="info">
              A comissão cai junto com as parcelas: {brl(comissao / nParcelas)} por mês, durante {nParcelas} meses.
            </span>
          )}
          {itens
            .filter((i) => i.pr < i.custo)
            .map((i, idx) => (
              <span key={idx} className="negativo">
                Atenção: {i.nome} abaixo do custo{mostraLucro ? ` (${brl(i.custo)})` : ""}.
              </span>
            ))}
        </div>
      )}

      <button type="submit" disabled={salvando || !valido}>
        {salvando ? "Salvando..." : itens.length > 1 ? `Registrar venda (${itens.length} itens)` : "Registrar venda"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}
