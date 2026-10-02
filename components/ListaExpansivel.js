"use client";

import { useState } from "react";
import BotaoExcluir from "./BotaoExcluir";
import useEnvio, { Mensagem } from "./useEnvio";

// Lista em cartões: tocar num item mostra os detalhes e o botão de excluir.
// itens: [{ id, titulo, sub, valor, detalhes: [texto] }]
export default function ListaExpansivel({
  itens,
  excluir,
  vazio = "Nada lançado ainda.",
}) {
  const [aberto, setAberto] = useState(null);
  const { msg, enviar } = useEnvio();

  if (itens.length === 0) return <p className="vazio">{vazio}</p>;

  return (
    <>
      <ul className="lista">
        {itens.map((i) => (
          <li key={i.id} style={{ display: "block", padding: 0 }}>
            <div
              className={`editavel ${aberto === i.id ? "selecionado" : ""}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
              onClick={() => setAberto(aberto === i.id ? null : i.id)}
            >
              <div>
                <div className="titulo">{i.titulo}</div>
                <div className="sub">{i.sub}</div>
              </div>
              <div className="valor">{i.valor}</div>
            </div>
            {aberto === i.id && (
              <div className="detalhe-item">
                {i.detalhes?.map((d) => (
                  <p key={d}>{d}</p>
                ))}
                <BotaoExcluir
                  onConfirmar={() =>
                    enviar(excluir, i.id, { textoOk: "Excluído." })
                  }
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <Mensagem msg={msg} />
    </>
  );
}
