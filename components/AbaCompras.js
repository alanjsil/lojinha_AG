"use client";

import { useEffect, useState } from "react";
import { editarCompra, excluirCompra, registrarCompra } from "../app/actions";
import { brl, dataBR, hoje, numero, qtd } from "../lib/formato";
import CamposPagamento from "./CamposPagamento";
import ListaExpansivel from "./ListaExpansivel";
import useEnvio, { Mensagem } from "./useEnvio";

function useDataHoje() {
  const [data, setData] = useState("");
  useEffect(() => setData(hoje()), []);
  return [data, setData];
}

function FormCompra({ produtos, cartoes }) {
  const { salvando, msg, enviar } = useEnvio();
  const [data, setData] = useDataHoje();
  const [f, setF] = useState({
    produtoId: "",
    quantidade: "",
    custo: "",
    fornecedor: "",
    cartaoId: "",
    parcelas: "1",
  });

  function escolher(id) {
    const ultimo = produtos.find((x) => x.id === id)?.ultimoCusto;
    setF({
      ...f,
      produtoId: id,
      custo: ultimo != null ? String(ultimo) : "",
    });
  }

  const produtoEscolhido = produtos.find((x) => x.id === f.produtoId);

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(
          registrarCompra,
          { ...f, data },
          {
            textoOk: "Compra registrada; estoque atualizado.",
            aoConcluir: () =>
              setF({
                ...f,
                produtoId: "",
                quantidade: "",
                custo: "",
                fornecedor: "",
                parcelas: "1",
              }),
          },
        );
      }}
    >
      <h2>Compra de mercadoria</h2>
      <label htmlFor="produto">Produto</label>
      <select id="produto" value={f.produtoId} onChange={(e) => escolher(e.target.value)} required>
        <option value="">Escolha...</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      <div className="linha-2">
        <div>
          <label htmlFor="qtd">Quantidade</label>
          <input id="qtd" type="number" inputMode="decimal" step="any" min="0" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} required />
        </div>
        <div>
          <label htmlFor="custo">Custo unit. (R$)</label>
          <input id="custo" type="number" inputMode="decimal" step="0.01" min="0" value={f.custo} onChange={(e) => setF({ ...f, custo: e.target.value })} required />
        </div>
      </div>
      {produtoEscolhido && (
        <div className="sub">Custo médio atual: {brl(produtoEscolhido.custo)}. Após salvar, o custo do produto é recalculado automaticamente como a média ponderada de todas as compras.</div>
      )}
      <label htmlFor="forn">Fornecedor</label>
      <input id="forn" value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} />
      <label htmlFor="data">Data</label>
      <input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
      <CamposPagamento
        id="compra"
        cartoes={cartoes}
        cartaoId={f.cartaoId}
        parcelas={f.parcelas}
        data={data}
        total={numero(f.quantidade) * numero(f.custo)}
        aoMudar={(p) => setF({ ...f, ...p })}
      />
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar compra"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

function FormEditarCompra({ compra, cartoes, aoFechar }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState({
    quantidade: String(compra.quantidade),
    custo: String(compra.custo_unit),
    fornecedor: compra.fornecedor ?? "",
    data: compra.data,
    cartaoId: compra.cartao_id ?? "",
    parcelas: String(compra.parcelas),
  });
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(editarCompra, { id: compra.id, ...f }, { textoOk: "Compra atualizada!", aoConcluir: aoFechar });
      }}
    >
      <div className="linha-2">
        <div>
          <label htmlFor={`ecq-${compra.id}`}>Quantidade</label>
          <input id={`ecq-${compra.id}`} type="number" inputMode="decimal" step="any" min="0" value={f.quantidade} onChange={set("quantidade")} required />
        </div>
        <div>
          <label htmlFor={`ecc-${compra.id}`}>Custo unit. (R$)</label>
          <input id={`ecc-${compra.id}`} type="number" inputMode="decimal" step="0.01" min="0" value={f.custo} onChange={set("custo")} required />
        </div>
      </div>
      <label htmlFor={`ecf-${compra.id}`}>Fornecedor</label>
      <input id={`ecf-${compra.id}`} value={f.fornecedor} onChange={set("fornecedor")} />
      <label htmlFor={`ecd-${compra.id}`}>Data</label>
      <input id={`ecd-${compra.id}`} type="date" value={f.data} onChange={set("data")} required />
      <CamposPagamento
        id={`ec-${compra.id}`}
        cartoes={cartoes}
        cartaoId={f.cartaoId}
        parcelas={f.parcelas}
        data={f.data}
        total={numero(f.quantidade) * numero(f.custo)}
        aoMudar={(p) => setF({ ...f, ...p })}
      />
      <p className="sub">O custo do produto é recalculado automaticamente ao salvar.</p>
      <div className="acoes-item">
        <button type="button" className="botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <Mensagem msg={msg} />
    </form>
  );
}

// Aba Compras do Estoque: entrada de mercadoria + últimos 30 dias (gerente edita)
export default function AbaCompras({ produtos, compras, cartoes, gerente }) {
  const nomeCartao = new Map(cartoes.map((c) => [c.id, c.nome]));
  const itens = compras.map((c) => ({
    id: c.id,
    titulo: c.produto,
    sub: `${dataBR(c.data)} · ${qtd(c.quantidade)} × ${brl(c.custo_unit)}${c.cartao_id ? ` · ${nomeCartao.get(c.cartao_id) ?? "Cartão"}${c.parcelas > 1 ? ` ${c.parcelas}x` : ""}` : ""}${c.fornecedor ? ` · ${c.fornecedor}` : ""}`,
    valor: brl(c.quantidade * c.custo_unit),
    detalhes: ["Excluir remove a entrada do estoque."],
    dados: c,
  }));

  return (
    <>
      <FormCompra produtos={produtos} cartoes={cartoes} />
      <div className="card">
        <h2>Últimos 30 dias</h2>
        <ListaExpansivel
          itens={itens}
          excluir={excluirCompra}
          vazio="Nenhuma compra nos últimos 30 dias."
          renderEditar={gerente ? (item, fechar) => <FormEditarCompra compra={item.dados} cartoes={cartoes} aoFechar={fechar} /> : undefined}
        />
      </div>
    </>
  );
}
