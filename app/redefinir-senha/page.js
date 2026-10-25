"use client";

import { useState } from "react";
import CampoSenha from "../../components/CampoSenha";
import { redefinirSenha } from "./actions";

export default function RedefinirSenha() {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    if (senha !== confirmacao) return setErro("As senhas não são iguais.");
    setEnviando(true);
    const r = await redefinirSenha({ senha }); // sucesso redireciona e não volta
    setEnviando(false);
    if (r && !r.ok) setErro(r.erro);
  }

  return (
    <form className="card login" onSubmit={enviar}>
      <h1>Nova senha</h1>
      <label htmlFor="senha">Nova senha (mínimo 8)</label>
      <CampoSenha id="senha" autoComplete="new-password" minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} />
      <label htmlFor="confirmacao">Repita a nova senha</label>
      <CampoSenha id="confirmacao" autoComplete="new-password" minLength={8} required value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
      {erro && <p className="msg-erro">{erro}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? "Salvando..." : "Salvar senha"}
      </button>
    </form>
  );
}
