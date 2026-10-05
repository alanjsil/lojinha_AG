"use client";

import { useState } from "react";
import BotaoExcluir from "./BotaoExcluir";
import useEnvio, { Mensagem } from "./useEnvio";

// Lista em cartões: tocar num item mostra os detalhes e os botões de ação.
// itens: [{ id, titulo, sub, valor, detalhes: [texto] }]
// renderEditar(item, fechar): opcional; quando passado, aparece o botão Editar
// ao lado de Excluir e o formulário abre dentro do próprio item.
export default function ListaExpansivel({
  itens,
  excluir,
  renderEditar,
  vazio = "Nada lançado ainda.",
}) {
  const [aberto, setAberto] = useState(null);
  const [editando, setEditando] = useState(null);
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
              onClick={() => {
                setAberto(aberto === i.id ? null : i.id);
                setEditando(null);
              }}
            >
              <div>
                <div className="titulo">{i.titulo}</div>
                <div className="sub">{i.sub}</div>
              </div>
              <div className="valor">{i.valor}</div>
            </div>
            {aberto === i.id && (
              <div className="detalhe-item">
                {editando === i.id ? (
                  renderEditar(i, () => setEditando(null))
                ) : (
                  <>
                    {i.detalhes?.map((d) => (
                      <p key={d}>{d}</p>
                    ))}
                    <div className={renderEditar ? "acoes-item" : undefined}>
                      {renderEditar && (
                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={() => setEditando(i.id)}
                        >
                          Editar
                        </button>
                      )}
                      <BotaoExcluir
                        onConfirmar={() =>
                          enviar(excluir, i.id, { textoOk: "Excluído." })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Mensagem msg={msg} />
    </>
  );
}
