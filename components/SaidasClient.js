"use client";

import { useEffect, useState } from "react";
import {
  excluirCompra,
  excluirDespesa,
  excluirLancamento,
  registrarCompra,
  registrarDespesa,
  registrarLancamento,
} from "../app/actions";
import { brl, dataBR, hoje, qtd } from "../lib/formato";
import ListaExpansivel from "./ListaExpansivel";
import useEnvio, { Mensagem } from "./useEnvio";

const TIPOS = {
  aluguel: "Aluguel",
  agua: "Água",
  luz: "Luz",
  internet: "Internet",
  gasolina: "Gasolina",
  outros: "Outros",
};

const TIPOS_LANCAMENTO = {
  pro_labore: "Pró-labore",
  pagamento_comissao: "Pagamento de comissão",
  saque: "Saque",
  aporte: "Aporte",
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
      {produtoEscolhido && (
        <div className="sub">
          Custo médio atual: {brl(produtoEscolhido.custo)}. Após salvar, o custo
          do produto é recalculado automaticamente como a média ponderada de
          todas as compras.
        </div>
      )}
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

function FormLancamento({ vendedores }) {
  const { salvando, msg, enviar } = useEnvio();
  const [data, setData] = useDataHoje();
  const [f, setF] = useState({
    tipo: "pro_labore",
    descricao: "",
    valor: "",
    vendedorId: "",
  });
  const porComissao = f.tipo === "pagamento_comissao";

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(
          registrarLancamento,
          { ...f, data },
          {
            textoOk: "Lançamento registrado!",
            aoConcluir: () => setF({ ...f, descricao: "", valor: "" }),
          },
        );
      }}
    >
      <h2>Lançamento</h2>
      <label htmlFor="ltipo">Tipo</label>
      <select
        id="ltipo"
        value={f.tipo}
        onChange={(e) => setF({ ...f, tipo: e.target.value })}
      >
        {Object.entries(TIPOS_LANCAMENTO).map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
      {porComissao && (
        <>
          <label htmlFor="lvend">Vendedor</label>
          <select
            id="lvend"
            value={f.vendedorId}
            onChange={(e) => setF({ ...f, vendedorId: e.target.value })}
            required
          >
            <option value="">Escolha...</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor="lvalor">Valor (R$)</label>
      <input
        id="lvalor"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={f.valor}
        onChange={(e) => setF({ ...f, valor: e.target.value })}
        required
      />
      <label htmlFor="ldesc">Descrição</label>
      <input
        id="ldesc"
        value={f.descricao}
        onChange={(e) => setF({ ...f, descricao: e.target.value })}
      />
      <label htmlFor="ldata">Data</label>
      <input
        id="ldata"
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        required
      />
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar lançamento"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

export default function SaidasClient({
  produtos,
  compras,
  despesas,
  lancamentos,
  vendedores,
  gerente,
}) {
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
  const itensLancamentos = lancamentos.map((l) => ({
    id: l.id,
    titulo: TIPOS_LANCAMENTO[l.tipo],
    sub: `${dataBR(l.data)}${l.vendedor ? ` · ${l.vendedor}` : ""}${l.descricao ? ` · ${l.descricao}` : ""}`,
    valor: brl(l.valor),
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
          <button
            type="button"
            className={aba === "lancamentos" ? "ativo" : ""}
            onClick={() => setAba("lancamentos")}
          >
            Lançamentos
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
      ) : aba === "lancamentos" ? (
        <>
          <FormLancamento vendedores={vendedores} />
          <div className="card">
            <h2>Últimos 30 dias</h2>
            <ListaExpansivel
              itens={itensLancamentos}
              excluir={excluirLancamento}
              vazio="Nenhum lançamento nos últimos 30 dias."
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
