"use client";

import { useEffect, useState } from "react";
import { editarCartao, editarDespesa, editarLancamento, excluirDespesa, excluirLancamento, registrarCartao, registrarDespesa, registrarLancamento } from "../app/actions";
import { brl, dataBR, hoje } from "../lib/formato";
import CamposPagamento from "./CamposPagamento";
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


function FormDespesa({ cartoes }) {
  const { salvando, msg, enviar } = useEnvio();
  const [data, setData] = useDataHoje();
  const [f, setF] = useState({ tipo: "gasolina", descricao: "", valor: "", cartaoId: "", parcelas: "1" });

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
            aoConcluir: () => setF({ ...f, descricao: "", valor: "", parcelas: "1" }),
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
      <CamposPagamento id="desp" cartoes={cartoes} cartaoId={f.cartaoId} parcelas={f.parcelas} data={data} total={Number(f.valor)} aoMudar={(p) => setF({ ...f, ...p })} />
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar despesa"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

function FormEditarDespesa({ despesa, cartoes, aoFechar }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState({
    tipo: despesa.tipo,
    valor: String(despesa.valor),
    descricao: despesa.descricao ?? "",
    data: despesa.data,
    cartaoId: despesa.cartao_id ?? "",
    parcelas: String(despesa.parcelas),
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
      <CamposPagamento id={`e-${despesa.id}`} cartoes={cartoes} cartaoId={f.cartaoId} parcelas={f.parcelas} data={f.data} total={Number(f.valor)} aoMudar={(p) => setF({ ...f, ...p })} />
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

const CARTAO_VAZIO = { nome: "", fechamento: "", vencimento: "", ativo: true };

// Cartão da loja: o gasto a partir do dia de fechamento cai na fatura seguinte, que vence no dia de vencimento.
function FormCartao({ inicial, aoFechar, embutido = false }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState(inicial);
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });
  const sufixo = f.id ?? "novo";

  return (
    <form
      className={embutido ? "form-inline" : "card"}
      onSubmit={(e) => {
        e.preventDefault();
        enviar(f.id ? editarCartao : registrarCartao, f, { aoConcluir: aoFechar, textoOk: "Cartão salvo!" });
      }}
    >
      {!embutido && <h2>Novo cartão</h2>}
      <label htmlFor={`cnome-${sufixo}`}>Nome</label>
      <input id={`cnome-${sufixo}`} value={f.nome} onChange={set("nome")} maxLength={40} placeholder="Ex.: Nubank" required />
      <div className="linha-2">
        <div>
          <label htmlFor={`cfech-${sufixo}`}>Dia que fecha</label>
          <input id={`cfech-${sufixo}`} type="number" inputMode="numeric" step="1" min="1" max="28" value={f.fechamento} onChange={set("fechamento")} required />
        </div>
        <div>
          <label htmlFor={`cvenc-${sufixo}`}>Dia que vence</label>
          <input id={`cvenc-${sufixo}`} type="number" inputMode="numeric" step="1" min="1" max="28" value={f.vencimento} onChange={set("vencimento")} required />
        </div>
      </div>
      {f.id && (
        <label className="chk">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          Ativo (aparece para escolher)
        </label>
      )}
      <div className="acoes-item">
        <button type="button" className="botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="submit" disabled={salvando || !f.nome.trim()}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <Mensagem msg={msg} />
    </form>
  );
}

function AbaCartoes({ cartoes }) {
  const [editando, setEditando] = useState(null);

  return (
    <>
      {editando && !editando.id ? (
        <FormCartao inicial={editando} aoFechar={() => setEditando(null)} />
      ) : (
        <button type="button" style={{ marginTop: 0, marginBottom: 16 }} onClick={() => setEditando(CARTAO_VAZIO)}>
          Novo cartão
        </button>
      )}
      <div className="card">
        {cartoes.length === 0 ? (
          <p className="vazio">Nenhum cartão. Sem cartão, despesas e compras saem do caixa na própria data.</p>
        ) : (
          <ul className="lista">
            {cartoes.map((c) =>
              editando?.id === c.id ? (
                <li key={c.id} className="editando">
                  <FormCartao inicial={editando} aoFechar={() => setEditando(null)} embutido />
                </li>
              ) : (
                <li
                  key={c.id}
                  className="editavel"
                  onClick={() => setEditando({ id: c.id, nome: c.nome, fechamento: String(c.dia_fechamento), vencimento: String(c.dia_vencimento), ativo: c.ativo })}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="titulo">
                      {c.nome}
                      {!c.ativo && " (desativado)"}
                    </div>
                    <div className="sub">
                      Fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
        <p className="info">
          O gasto no cartão conta no lucro na data da compra e sai do caixa no vencimento de cada parcela. Mudar os dias não altera o que já foi lançado.
        </p>
      </div>
    </>
  );
}

export default function SaidasClient({ despesas, lancamentos, vendedores, cartoes }) {
  const [aba, setAba] = useState("despesas");
  const nomeCartao = new Map(cartoes.map((c) => [c.id, c.nome]));

  const itensDespesas = despesas.map((d) => ({
    id: d.id,
    titulo: TIPOS[d.tipo],
    sub: `${dataBR(d.data)}${d.cartao_id ? ` · ${nomeCartao.get(d.cartao_id) ?? "Cartão"}${d.parcelas > 1 ? ` ${d.parcelas}x` : ""}` : ""}${d.descricao ? ` · ${d.descricao}` : ""}`,
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
        <button type="button" className={aba === "cartoes" ? "ativo" : ""} onClick={() => setAba("cartoes")}>
          Cartões
        </button>
      </div>

      {aba === "cartoes" ? (
        <AbaCartoes cartoes={cartoes} />
      ) : aba === "lancamentos" ? (
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
          <FormDespesa cartoes={cartoes} />
          <div className="card">
            <h2>Últimos 30 dias</h2>
            <ListaExpansivel
              itens={itensDespesas}
              excluir={excluirDespesa}
              vazio="Nenhuma despesa nos últimos 30 dias."
              renderEditar={(item, fechar) => <FormEditarDespesa despesa={item.dados} cartoes={cartoes} aoFechar={fechar} />}
            />
          </div>
        </>
      )}
    </>
  );
}
