"use client";

import { useState } from "react";
import { editarVenda } from "../app/actions";
import useEnvio, { Mensagem } from "./useEnvio";

const FORMAS = [
  ["a_vista", "À Vista"],
  ["cartao", "Cartão"],
];

// Edição de uma venda dentro do próprio item da lista (ListaExpansivel).
export default function FormEditarVenda({ venda, aoFechar }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState(venda);
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });

  return (
    <form
      className="form-inline"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(editarVenda, { ...f, id: venda.id, cliente: { nome: f.clienteNome, telefone: f.clienteTelefone } }, { textoOk: "Venda atualizada!", aoConcluir: aoFechar });
      }}
    >
      <div className="linha-2">
        <div>
          <label htmlFor={`eqtd-${venda.id}`}>Quantidade</label>
          <input id={`eqtd-${venda.id}`} type="number" inputMode="decimal" step="any" min="0" value={f.quantidade} onChange={set("quantidade")} required />
        </div>
        <div>
          <label htmlFor={`epreco-${venda.id}`}>Preço unit. (R$)</label>
          <input id={`epreco-${venda.id}`} type="number" inputMode="decimal" step="0.01" min="0" value={f.preco} onChange={set("preco")} required />
        </div>
      </div>
      <label htmlFor={`edata-${venda.id}`}>Data</label>
      <input id={`edata-${venda.id}`} type="date" value={f.data} onChange={set("data")} required />
      <label htmlFor={`eobs-${venda.id}`}>Obs (opcional)</label>
      <input id={`eobs-${venda.id}`} type="text" maxLength={200} value={f.obs} onChange={set("obs")} />
      <label htmlFor={`ecli-tel-${venda.id}`}>WhatsApp do cliente (vale para a venda toda)</label>
      <input id={`ecli-tel-${venda.id}`} type="tel" inputMode="tel" autoComplete="off" maxLength={20} value={f.clienteTelefone} onChange={set("clienteTelefone")} />
      <label htmlFor={`ecli-nome-${venda.id}`}>Nome do cliente</label>
      <input id={`ecli-nome-${venda.id}`} type="text" autoComplete="off" maxLength={80} value={f.clienteNome} onChange={set("clienteNome")} />
      <label>Pagamento</label>
      <div className="segmentos" style={{ marginBottom: 0 }}>
        {FORMAS.map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            className={f.pagamento === valor ? "ativo" : ""}
            onClick={() =>
              setF({
                ...f,
                pagamento: valor,
                parcelas: valor === "cartao" ? f.parcelas : "1",
              })
            }
          >
            {rotulo}
          </button>
        ))}
      </div>
      {f.pagamento === "cartao" && (
        <>
          <label htmlFor={`eparc-${venda.id}`}>Parcelas</label>
          <select id={`eparc-${venda.id}`} value={f.parcelas} onChange={set("parcelas")}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}x
              </option>
            ))}
          </select>
          <label htmlFor={`evenc-${venda.id}`}>1ª parcela vence em</label>
          <input id={`evenc-${venda.id}`} type="date" value={f.primeiroVencimento} onChange={set("primeiroVencimento")} required />
        </>
      )}
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
