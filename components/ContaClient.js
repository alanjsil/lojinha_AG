"use client";

import Link from "next/link";
import { useState } from "react";
import { salvarDados, sairDaConta } from "../app/conta/actions";
import { brl, qtd } from "../lib/formato";
import { ETAPAS, formatarTelefone, linkWhatsApp, STATUS_PEDIDO } from "../lib/pedido";
import useEnvio, { Mensagem } from "./useEnvio";

// fuso fixo: o servidor (UTC) e o celular precisam desenhar a mesma hora
const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Recebido → Confirmado → Pronto → Entregue (cancelado mostra só o selo)
function Andamento({ status }) {
  if (status === "cancelado") return <p className="selo-status cancelado">Cancelado</p>;
  const atual = ETAPAS.indexOf(status);
  return (
    <ol className="andamento" aria-label={`Situação: ${STATUS_PEDIDO[status]}`}>
      {ETAPAS.map((e, i) => (
        <li key={e} className={i <= atual ? "feito" : undefined} aria-current={i === atual ? "step" : undefined}>
          {STATUS_PEDIDO[e]}
        </li>
      ))}
    </ol>
  );
}

function FormDados({ usuario, aoFechar }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState({ nome: usuario.nome, telefone: formatarTelefone(usuario.telefone) });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(salvarDados, f, { textoOk: "Dados salvos!", aoConcluir: aoFechar });
      }}
    >
      <label htmlFor="conta-nome">Nome</label>
      <input id="conta-nome" autoComplete="name" maxLength={80} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
      <label htmlFor="conta-tel">WhatsApp com DDD</label>
      <input id="conta-tel" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} required />
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

export default function ContaClient({ usuario, pedidos, whatsapp, children }) {
  const [editando, setEditando] = useState(false);
  const falar = (texto) => linkWhatsApp(whatsapp, texto);

  return (
    <>
      <div className="card">
        <h2>Olá, {usuario.nome.split(" ")[0]}!</h2>
        {editando ? (
          <FormDados usuario={usuario} aoFechar={() => setEditando(false)} />
        ) : (
          <>
            <p className="info" style={{ marginTop: 0 }}>
              WhatsApp: {formatarTelefone(usuario.telefone) || "não informado"} · {usuario.email}
            </p>
            <button type="button" className="botao-secundario" onClick={() => setEditando(true)}>
              Editar meus dados
            </button>
          </>
        )}
      </div>

      {children}

      <h2>Meus pedidos</h2>
      {pedidos.length === 0 ? (
        <div className="card">
          <p className="vazio">Você ainda não fez pedidos com esta conta.</p>
          <Link href="/" className="botao-link-cheio">
            Ver os produtos
          </Link>
        </div>
      ) : (
        pedidos.map((p) => (
          <div key={p.id} className="card pedido-cliente">
            <div className="titulo-linha" style={{ margin: 0 }}>
              <strong>Pedido nº {p.numero}</strong>
              <span className="sub">{quando(p.criado_em)}</span>
            </div>
            <Andamento status={p.status} />
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
            {whatsapp && (
              <a className="botao-whatsapp" href={falar(`Olá! Sobre o meu pedido nº ${p.numero} na Lojinha A&G:`)} target="_blank" rel="noreferrer">
                Chamar a loja no WhatsApp
              </a>
            )}
          </div>
        ))
      )}

      <form action={sairDaConta}>
        <button type="submit" className="sair">
          Sair da conta
        </button>
      </form>
    </>
  );
}
