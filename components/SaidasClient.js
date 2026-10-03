"use client";

import { useEffect, useState } from "react";
import {
  excluirCompra,
  excluirDespesa,
  registrarCompra,
  registrarDespesa,
} from "../app/actions";
import { brl, dataBR, hoje, qtd } from "../lib/formato";
import ListaExpansivel from "./ListaExpansivel";
import useEnvio, { Mensagem } from "./useEnvio";

const TIPOS = {
  aluguel: "Aluguel",
  agua: "Água",
  luz: "Luz",
  internet: "Internet",
  outros: "Outros",
};

function useDataHoje() {
  const [data, setData] = useState("");
  useEffect(() => setData(hoje()), []);
  return [data, setData];
}

function FormCompra({ produtos }) {
  const { salvando, msg, enviar } = useEnvio();
  const [data, setData] = useDataHoje();
  const [f, setF] = useState({
    produtoId: "",
    quantidade: "",
    custo: "",
    fornecedor: "",
    atualizarCusto: true,
  });

  function escolher(id) {
    const p = produtos.find((x) => x.id === id);
    setF({ ...f, produtoId: id, custo: p ? String(p.custo) : "" });
  }

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
              }),
          },
        );
      }}
    >
      <h2>Compra de mercadoria</h2>
      <label htmlFor="produto">Produto</label>
      <select
        id="produto"
        value={f.produtoId}
        onChange={(e) => escolher(e.target.value)}
        required
      >
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
          <input
            id="qtd"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={f.quantidade}
            onChange={(e) => setF({ ...f, quantidade: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="custo">Custo unit. (R$)</label>
          <input
            id="custo"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={f.custo}
            onChange={(e) => setF({ ...f, custo: e.target.value })}
            required
          />
        </div>
      </div>
      <label htmlFor="forn">Fornecedor</label>
      <input
        id="forn"
        value={f.fornecedor}
        onChange={(e) => setF({ ...f, fornecedor: e.target.value })}
      />
      <label htmlFor="data">Data</label>
      <input
        id="data"
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        required
      />
      <label className="chk">
        <input
          type="checkbox"
          checked={f.atualizarCusto}
          onChange={(e) => setF({ ...f, atualizarCusto: e.target.checked })}
        />
        Usar este custo no produto
      </label>
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar compra"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

function FormDespesa() {
  const { salvando, msg, enviar } = useEnvio();
  const [data, setData] = useDataHoje();
  const [f, setF] = useState({ tipo: "aluguel", descricao: "", valor: "" });

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(
          registrarDespesa,
          { ...f, data },
          {
            textoOk: "Despesa registrada!",
            aoConcluir: () => setF({ ...f, descricao: "", valor: "" }),
          },
        );
      }}
    >
      <h2>Despesa</h2>
      <label htmlFor="tipo">Tipo</label>
      <select
        id="tipo"
        value={f.tipo}
        onChange={(e) => setF({ ...f, tipo: e.target.value })}
      >
        {Object.entries(TIPOS).map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
      <label htmlFor="valor">Valor (R$)</label>
      <input
        id="valor"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={f.valor}
        onChange={(e) => setF({ ...f, valor: e.target.value })}
        required
      />
      <label htmlFor="desc">Descrição</label>
      <input
        id="desc"
        value={f.descricao}
        onChange={(e) => setF({ ...f, descricao: e.target.value })}
      />
      <label htmlFor="ddata">Data</label>
      <input
        id="ddata"
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        required
      />
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar despesa"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

export default function SaidasClient({ produtos, compras, despesas, gerente }) {
  const [aba, setAba] = useState("compras");

  const itensCompras = compras.map((c) => ({
    id: c.id,
    titulo: c.produto,
    sub: `${dataBR(c.data)} · ${qtd(c.quantidade)} × ${brl(c.custo_unit)}${c.fornecedor ? ` · ${c.fornecedor}` : ""}`,
    valor: brl(c.quantidade * c.custo_unit),
    detalhes: ["Excluir remove a entrada do estoque."],
  }));
  const itensDespesas = despesas.map((d) => ({
    id: d.id,
    titulo: TIPOS[d.tipo],
    sub: `${dataBR(d.data)}${d.descricao ? ` · ${d.descricao}` : ""}`,
    valor: brl(d.valor),
  }));

  return (
    <>
      {gerente && (
        <div className="segmentos">
          <button
            type="button"
            className={aba === "compras" ? "ativo" : ""}
            onClick={() => setAba("compras")}
          >
            Compras
          </button>
          <button
            type="button"
            className={aba === "despesas" ? "ativo" : ""}
            onClick={() => setAba("despesas")}
          >
            Despesas
          </button>
        </div>
      )}

      {aba === "compras" || !gerente ? (
        <>
          <FormCompra produtos={produtos} />
          <div className="card">
            <h2>Últimos 30 dias</h2>
            <ListaExpansivel
              itens={itensCompras}
              excluir={excluirCompra}
              vazio="Nenhuma compra nos últimos 30 dias."
            />
          </div>
        </>
      ) : (
        <>
          <FormDespesa />
          <div className="card">
            <h2>Últimos 30 dias</h2>
            <ListaExpansivel
              itens={itensDespesas}
              excluir={excluirDespesa}
              vazio="Nenhuma despesa nos últimos 30 dias."
            />
          </div>
        </>
      )}
    </>
  );
}
