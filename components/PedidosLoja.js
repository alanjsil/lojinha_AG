"use client";

import Link from "next/link";
import { useState } from "react";
import { atualizarPedido } from "../app/actions";
import { brl, qtd } from "../lib/formato";
import { formatarTelefone, linkWhatsApp, proximoStatus, STATUS_PEDIDO } from "../lib/pedido";
import BotaoExcluir from "./BotaoExcluir";
import useEnvio, { Mensagem } from "./useEnvio";

// fuso fixo: o servidor (UTC) e o celular precisam desenhar a mesma hora
const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// botão do próximo passo; "entregue" sai pelo Lançar venda (que baixa o estoque)
const ACAO = { confirmado: "Confirmar pedido", pronto: "Marcar como pronto" };

// Pedidos da vitrine em aberto (recebido, confirmado, pronto). Toque abre os detalhes no próprio item.
export default function PedidosLoja({ pedidos }) {
  const [aberto, setAberto] = useState(null);
  const { msg, salvando, enviar } = useEnvio();

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
                  <span className={`selo-status ${p.status}`}>{STATUS_PEDIDO[p.status]}</span>
                </div>
                <div className="valor">{brl(p.total)}</div>
              </>
            ) : (
              <div className="form-inline">
                <div className="titulo">
                  Pedido nº {p.numero} · {p.cliente_nome}
                </div>
                <span className={`selo-status ${p.status}`}>
                  {STATUS_PEDIDO[p.status]}
                  {p.cliente_id ? " · cliente com conta (recebe avisos)" : ""}
                </span>
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
                    {formatarTelefone(p.cliente_telefone)}
                  </a>
                </p>
                {ACAO[proximoStatus(p.status)] && (
                  <button type="button" disabled={salvando} onClick={() => enviar(atualizarPedido, { id: p.id, status: proximoStatus(p.status) }, { textoOk: `Pedido nº ${p.numero}: ${STATUS_PEDIDO[proximoStatus(p.status)].toLowerCase()}.` })}>
                    {salvando ? "Salvando..." : ACAO[proximoStatus(p.status)]}
                  </button>
                )}
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
