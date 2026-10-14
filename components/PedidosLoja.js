"use client";

import Link from "next/link";
import { useState } from "react";
import { atualizarPedido } from "../app/actions";
import { brl, qtd } from "../lib/formato";
import { linkWhatsApp } from "../lib/pedido";
import BotaoExcluir from "./BotaoExcluir";
import useEnvio, { Mensagem } from "./useEnvio";

// fuso fixo: o servidor (UTC) e o celular precisam desenhar a mesma hora
const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Pedidos feitos na vitrine que ainda não viraram venda. Toque abre os detalhes no próprio item.
export default function PedidosLoja({ pedidos }) {
  const [aberto, setAberto] = useState(null);
  const { msg, enviar } = useEnvio();

  if (pedidos.length === 0) return null;

  return (
    <div className="card">
      <h2>
        Pedidos da loja <span className="contador">{pedidos.length}</span>
      </h2>
      <ul className="lista">
        {pedidos.map((p) => (
          <li key={p.id} className={aberto === p.id ? "editando" : "editavel"} onClick={aberto === p.id ? undefined : () => setAberto(p.id)}>
            {aberto !== p.id ? (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="titulo">
                    nº {p.numero} · {p.cliente_nome}
                  </div>
                  <div className="sub">
                    {quando(p.criado_em)} · {p.itens.length} {p.itens.length === 1 ? "item" : "itens"}
                  </div>
                </div>
                <div className="valor">{brl(p.total)}</div>
              </>
            ) : (
              <div className="form-inline">
                <div className="titulo">
                  Pedido nº {p.numero} · {p.cliente_nome}
                </div>
                <ul className="lista">
                  {p.itens.map((i) => (
                    <li key={i.produto_id}>
                      <span>
                        {qtd(i.quantidade)} × {i.nome}
                      </span>
                      <span className="valor">{brl(i.quantidade * i.preco)}</span>
                    </li>
                  ))}
                </ul>
                <div className="destaque">
                  <span>Total</span>
                  <span>{brl(p.total)}</span>
                </div>
                {p.obs && <p className="info">Obs.: {p.obs}</p>}
                <p className="info">
                  WhatsApp do cliente:{" "}
                  <a href={linkWhatsApp(p.cliente_telefone, `Olá, ${p.cliente_nome}! Sobre o seu pedido nº ${p.numero} na Lojinha A&G:`)} target="_blank" rel="noreferrer">
                    {p.cliente_telefone}
                  </a>
                </p>
                <div className="acoes-item">
                  <button type="button" className="botao-secundario" onClick={() => setAberto(null)}>
                    Fechar
                  </button>
                  <Link className="botao-link-cheio" href={`/vendas?pedido=${p.id}`} onClick={() => setAberto(null)}>
                    Lançar venda
                  </Link>
                </div>
                <BotaoExcluir texto="Cancelar pedido" onConfirmar={() => enviar(atualizarPedido, { id: p.id, status: "cancelado" }, { textoOk: "Pedido cancelado." })} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <Mensagem msg={msg} />
    </div>
  );
}
