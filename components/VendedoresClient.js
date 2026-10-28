"use client";

import { useState } from "react";
import { cadastrarVendedor, editarVendedor } from "../app/actions";
import { qtd } from "../lib/formato";
import { COMISSAO_MAXIMA, COMISSAO_PADRAO, comissaoDaSocia } from "../lib/vendedores";
import CampoSenha from "./CampoSenha";
import useEnvio, { Mensagem } from "./useEnvio";

const NOVO = { nome: "", telefone: "", email: "", senha: "", comissao: String(COMISSAO_PADRAO) };

const celularBR = (t) => (t?.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : (t ?? ""));

function PreviaComissao({ comissao }) {
  const c = Number(comissao);
  if (!Number.isFinite(c) || c < COMISSAO_PADRAO || c > COMISSAO_MAXIMA) {
    return <p className="info">De {COMISSAO_PADRAO}% a {COMISSAO_MAXIMA}% do lucro.</p>;
  }
  return (
    <p className="info">
      Vendedor {qtd(c)}% · sócia {qtd(comissaoDaSocia(c))}% do lucro de cada venda dele.
    </p>
  );
}

// Cadastro (com login) ou edição de um vendedor; na edição o e-mail e a senha não mudam por aqui
function FormVendedor({ inicial, aoFechar, embutido = false }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState(inicial);
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });
  const sufixo = f.id ?? "novo";

  return (
    <form
      className={embutido ? "form-inline" : "card"}
      onSubmit={(e) => {
        e.preventDefault();
        enviar(f.id ? editarVendedor : cadastrarVendedor, f, { aoConcluir: aoFechar, textoOk: "Vendedor salvo!" });
      }}
    >
      {!embutido && <h2>Novo vendedor</h2>}
      <label htmlFor={`vnome-${sufixo}`}>Nome</label>
      <input id={`vnome-${sufixo}`} value={f.nome} onChange={set("nome")} maxLength={60} autoComplete="off" required />
      <label htmlFor={`vtel-${sufixo}`}>Celular (WhatsApp)</label>
      <input id={`vtel-${sufixo}`} type="tel" inputMode="tel" value={f.telefone} onChange={set("telefone")} placeholder="(54) 98888-1234" required />
      {!f.id && (
        <>
          <label htmlFor={`vemail-${sufixo}`}>E-mail (para entrar no app)</label>
          <input id={`vemail-${sufixo}`} type="email" inputMode="email" autoComplete="off" value={f.email} onChange={set("email")} required />
          <label htmlFor={`vsenha-${sufixo}`}>Senha inicial</label>
          <CampoSenha id={`vsenha-${sufixo}`} autoComplete="new-password" minLength={8} value={f.senha} onChange={set("senha")} required />
        </>
      )}
      <label htmlFor={`vcom-${sufixo}`}>Comissão (% do lucro)</label>
      <input id={`vcom-${sufixo}`} type="number" inputMode="decimal" step="0.5" min={COMISSAO_PADRAO} max={COMISSAO_MAXIMA} value={f.comissao} onChange={set("comissao")} required />
      <PreviaComissao comissao={f.comissao} />
      {f.id && <p className="info">Mudar a comissão vale só para as próximas vendas.</p>}
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

export default function VendedoresClient({ vendedores }) {
  const [editando, setEditando] = useState(null);

  return (
    <>
      {editando && !editando.id ? (
        <FormVendedor inicial={editando} aoFechar={() => setEditando(null)} />
      ) : (
        <button type="button" style={{ marginTop: 0, marginBottom: 16 }} onClick={() => setEditando(NOVO)}>
          Novo vendedor
        </button>
      )}
      <div className="card">
        {vendedores.length === 0 ? (
          <p className="vazio">Nenhum vendedor cadastrado.</p>
        ) : (
          <ul className="lista">
            {vendedores.map((v) =>
              editando?.id === v.id ? (
                <li key={v.id} className="editando">
                  <FormVendedor inicial={editando} aoFechar={() => setEditando(null)} embutido />
                </li>
              ) : (
                <li key={v.id} className="editavel" onClick={() => setEditando({ id: v.id, nome: v.nome, telefone: v.telefone ?? "", comissao: String(Number(v.comissao_pct)) })}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="titulo">{v.nome}</div>
                    <div className="sub">{v.telefone ? celularBR(v.telefone) : "Sem celular"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="titulo">{qtd(Number(v.comissao_pct))}%</div>
                    <div className="sub">sócia {qtd(comissaoDaSocia(v.comissao_pct))}%</div>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
        <p className="info">
          Nas vendas de vendedor a sócia ganha {comissaoDaSocia(COMISSAO_PADRAO)}% do lucro; o que o vendedor ganhar acima de {COMISSAO_PADRAO}% sai da parte dela. Toque para editar.
        </p>
      </div>
    </>
  );
}
