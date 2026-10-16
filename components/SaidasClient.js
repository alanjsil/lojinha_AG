"use client";

import { useEffect, useState } from "react";
import { editarDespesa, editarLancamento, excluirDespesa, excluirLancamento, registrarDespesa, registrarLancamento } from "../app/actions";
import { brl, dataBR, hoje } from "../lib/formato";
import ListaExpansivel from "./ListaExpansivel";
import useEnvio, { Mensagem } from "./useEnvio";

const TIPOS = {
  gasolina: "Gasolina",
  alimentacao: "Alimentação",
  pedagio: "Pedágio",
  outros: "Outros",
  aluguel: "Aluguel",
  agua: "Água",
  luz: "Luz",
  internet: "Internet",
};

const TIPOS_LANCAMENTO = {
  pro_labore: "Pró-labore",
  pagamento_comissao: "Pagamento de comissão",
  saque: "Saque",
  capital_inicial: "Capital inicial",
  aporte: "Aporte",
  repasse: "Repasse de vendedor",
};

function useDataHoje() {
  const [data, setData] = useState("");
  useEffect(() => setData(hoje()), []);
  return [data, setData];
}


function FormDespesa() {
  const { salvando, msg, enviar } = useEnvio();
  const [data, setData] = useDataHoje();
  const [f, setF] = useState({ tipo: "gasolina", descricao: "", valor: "" });

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
      <select id="tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
        {Object.entries(TIPOS).map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
      <label htmlFor="valor">Valor (R$)</label>
      <input id="valor" type="number" inputMode="decimal" step="0.01" min="0" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} required />
      <label htmlFor="desc">Descrição</label>
      <input id="desc" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
      <label htmlFor="ddata">Data</label>
      <input id="ddata" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar despesa"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

function FormEditarDespesa({ despesa, aoFechar }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState({
    tipo: despesa.tipo,
    valor: String(despesa.valor),
    descricao: despesa.descricao ?? "",
    data: despesa.data,
  });
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(editarDespesa, { id: despesa.id, ...f }, { textoOk: "Despesa atualizada!", aoConcluir: aoFechar });
      }}
    >
      <label htmlFor={`etipo-${despesa.id}`}>Tipo</label>
      <select id={`etipo-${despesa.id}`} value={f.tipo} onChange={set("tipo")}>
        {Object.entries(TIPOS).map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
      <label htmlFor={`evalor-${despesa.id}`}>Valor (R$)</label>
      <input id={`evalor-${despesa.id}`} type="number" inputMode="decimal" step="0.01" min="0" value={f.valor} onChange={set("valor")} required />
      <label htmlFor={`edesc-${despesa.id}`}>Descrição</label>
      <input id={`edesc-${despesa.id}`} value={f.descricao} onChange={set("descricao")} />
      <label htmlFor={`edata-${despesa.id}`}>Data</label>
      <input id={`edata-${despesa.id}`} type="date" value={f.data} onChange={set("data")} required />
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


function FormEditarLancamento({ lancamento, vendedores, aoFechar }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState({
    valor: String(lancamento.valor),
    descricao: lancamento.descricao ?? "",
    data: lancamento.data,
    vendedorId: lancamento.vendedorId ?? "",
  });
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });
  const porVendedor = lancamento.tipo === "pagamento_comissao" || lancamento.tipo === "repasse";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(editarLancamento, { id: lancamento.id, ...f }, { textoOk: "Lançamento atualizado!", aoConcluir: aoFechar });
      }}
    >
      {porVendedor && (
        <>
          <label htmlFor={`elv-${lancamento.id}`}>Vendedor</label>
          <select id={`elv-${lancamento.id}`} value={f.vendedorId} onChange={set("vendedorId")} required>
            <option value="">Escolha...</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor={`elval-${lancamento.id}`}>Valor (R$)</label>
      <input id={`elval-${lancamento.id}`} type="number" inputMode="decimal" step="0.01" min="0" value={f.valor} onChange={set("valor")} required />
      <label htmlFor={`eldesc-${lancamento.id}`}>Descrição</label>
      <input id={`eldesc-${lancamento.id}`} value={f.descricao} onChange={set("descricao")} />
      <label htmlFor={`eldata-${lancamento.id}`}>Data</label>
      <input id={`eldata-${lancamento.id}`} type="date" value={f.data} onChange={set("data")} required />
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

function FormLancamento({ vendedores }) {
  const { salvando, msg, enviar } = useEnvio();
  const [data, setData] = useDataHoje();
  const [f, setF] = useState({
    tipo: "pro_labore",
    descricao: "",
    valor: "",
    vendedorId: "",
  });
  const porComissao = f.tipo === "pagamento_comissao" || f.tipo === "repasse";

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
      <select id="ltipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
        {Object.entries(TIPOS_LANCAMENTO).map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
      {porComissao && (
        <>
          <label htmlFor="lvend">Vendedor</label>
          <select id="lvend" value={f.vendedorId} onChange={(e) => setF({ ...f, vendedorId: e.target.value })} required>
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
      <input id="lvalor" type="number" inputMode="decimal" step="0.01" min="0" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} required />
      <label htmlFor="ldesc">Descrição</label>
      <input id="ldesc" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
      <label htmlFor="ldata">Data</label>
      <input id="ldata" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar lançamento"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

export default function SaidasClient({ despesas, lancamentos, vendedores }) {
  const [aba, setAba] = useState("despesas");

  const itensDespesas = despesas.map((d) => ({
    id: d.id,
    titulo: TIPOS[d.tipo],
    sub: `${dataBR(d.data)}${d.descricao ? ` · ${d.descricao}` : ""}`,
    valor: brl(d.valor),
    dados: d,
  }));
  const itensLancamentos = lancamentos.map((l) => ({
    id: l.id,
    titulo: TIPOS_LANCAMENTO[l.tipo],
    sub: `${dataBR(l.data)}${l.vendedor ? ` · ${l.vendedor}` : ""}${l.descricao ? ` · ${l.descricao}` : ""}`,
    valor: brl(l.valor),
    dados: l,
  }));

  return (
    <>
      <div className="segmentos">
        <button type="button" className={aba === "despesas" ? "ativo" : ""} onClick={() => setAba("despesas")}>
          Despesas
        </button>
        <button type="button" className={aba === "lancamentos" ? "ativo" : ""} onClick={() => setAba("lancamentos")}>
          Lançamentos
        </button>
      </div>

      {aba === "lancamentos" ? (
        <>
          <FormLancamento vendedores={vendedores} />
          <div className="card">
            <h2>Últimos 30 dias</h2>
            <ListaExpansivel
              itens={itensLancamentos}
              excluir={excluirLancamento}
              vazio="Nenhum lançamento nos últimos 30 dias."
              renderEditar={(item, fechar) => <FormEditarLancamento lancamento={item.dados} vendedores={vendedores} aoFechar={fechar} />}
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
              renderEditar={(item, fechar) => <FormEditarDespesa despesa={item.dados} aoFechar={fechar} />}
            />
          </div>
        </>
      )}
    </>
  );
}
