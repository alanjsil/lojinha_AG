"use client";

import { useState } from "react";
import { restaurarRegistro } from "../app/actions";
import useEnvio, { Mensagem } from "./useEnvio";

const COR = { criou: "positivo", apagou: "negativo" };

// Lista do histórico: tocar abre os detalhes; registros apagados têm o botão Restaurar.
export default function LogClient({ itens }) {
  const [aberto, setAberto] = useState(null);
  const { msg, salvando, enviar } = useEnvio();

  if (itens.length === 0) return <p className="vazio">Nada registrado ainda.</p>;

  return (
    <>
      <ul className="lista">
        {itens.map((i) => {
          const temDetalhe = i.detalhes.length > 0 || i.restauravel;
          return (
            <li key={i.id} style={{ display: "block", padding: 0 }}>
              <div
                className={`editavel ${aberto === i.id ? "selecionado" : ""}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                onClick={() => temDetalhe && setAberto(aberto === i.id ? null : i.id)}
              >
                <div>
                  <div className="titulo">{i.titulo}</div>
                  <div className="sub">{i.sub}</div>
                </div>
                <div className={`valor ${COR[i.acao] ?? ""}`}>{i.acaoRotulo}</div>
              </div>
              {aberto === i.id && (
                <div className="detalhe-item">
                  {i.detalhes.map((d) => (
                    <p key={d}>{d}</p>
                  ))}
                  {i.restauravel && (
                    <button
                      type="button"
                      className="botao-secundario"
                      disabled={salvando}
                      onClick={() => enviar(restaurarRegistro, { tabela: i.tabela, id: i.registroId }, { textoOk: "Restaurado." })}
                    >
                      {salvando ? "Restaurando..." : "Restaurar"}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Mensagem msg={msg} />
    </>
  );
}
