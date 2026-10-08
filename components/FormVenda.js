"use client";

import { useEffect, useState } from "react";
import { registrarVenda } from "../app/actions";
import { brl, hoje, numero, preenchido, qtd } from "../lib/formato";
import useEnvio, { Mensagem } from "./useEnvio";

const FORMAS = [
  ["a_vista", "À Vista"],
  ["cartao", "Cartão"],
];

export default function FormVenda({ produtos, comissaoPct }) {
  const { salvando, msg, enviar, limpar } = useEnvio();
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [preco, setPreco] = useState("");
  const [pagamento, setPagamento] = useState("a_vista");
  const [parcelas, setParcelas] = useState("1");
  const [data, setData] = useState("");

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
  const valido = produto && preenchido(quantidade) && preenchido(preco) && q > 0 && pr > 0;
  const total = valido ? q * pr : 0;
  const lucro = valido ? (pr - produto.custo) * q : 0;
  const comissao = Math.max(lucro, 0) * (comissaoPct / 100);
  const nParcelas = pagamento === "cartao" ? Number(parcelas) : 1;

  async function enviarVenda(e) {
    e.preventDefault();
    await enviar(
      registrarVenda,
      { produtoId, quantidade, preco, pagamento, parcelas: nParcelas, data },
      {
        textoOk: "Venda registrada!",
        aoConcluir: () => {
          setProdutoId("");
          setQuantidade("1");
          setPreco("");
          setParcelas("1");
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
      <label htmlFor="produto">Produto</label>
      <select id="produto" value={produtoId} onChange={(e) => escolher(e.target.value)} required>
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
          <input id="qtd" type="number" inputMode="decimal" step="any" min="0" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="preco">Preço unit. (R$)</label>
          <input id="preco" type="number" inputMode="decimal" step="0.01" min="0" value={preco} onChange={(e) => setPreco(e.target.value)} required />
        </div>
      </div>

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
        </>
      )}

      <label htmlFor="data">Data</label>
      <input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />

      {valido && (
        <div className="resumo-venda">
          <div>
            <span>Total</span>
            <strong>{brl(total)}</strong>
          </div>
          <div>
            <span>Lucro</span>
            <strong className={lucro < 0 ? "negativo" : "positivo"}>{brl(lucro)}</strong>
          </div>
          <div>
            <span>Sua comissão ({qtd(comissaoPct)}%)</span>
            <strong>{brl(comissao)}</strong>
          </div>
          {nParcelas > 1 && (
            <span className="info">
              A comissão cai junto com as parcelas: {brl(comissao / nParcelas)} por mês, durante {nParcelas} meses.
            </span>
          )}
          {pr < produto.custo && <span className="negativo">Atenção: preço abaixo do custo ({brl(produto.custo)}).</span>}
        </div>
      )}

      <button type="submit" disabled={salvando || !valido}>
        {salvando ? "Salvando..." : "Registrar venda"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}
