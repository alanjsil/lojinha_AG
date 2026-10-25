"use client";

import Link from "next/link";
import { useState } from "react";
import { pedirRecuperacao } from "./actions";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const r = await pedirRecuperacao({ email });
    setEnviando(false);
    if (r.ok) setEnviado(true);
    else setErro(r.erro);
  }

  if (enviado) {
    return (
      <div className="card login">
        <h1>Confira o e-mail</h1>
        <p className="info">
          Se <strong>{email}</strong> tiver conta, enviamos um link para criar uma nova senha. Olhe também o spam. O link vale por pouco tempo.
        </p>
        <Link href="/login" className="botao-link-cheio">
          Voltar para Entrar
        </Link>
      </div>
    );
  }

  return (
    <form className="card login" onSubmit={enviar}>
      <h1>Esqueci a senha</h1>
      <p className="info" style={{ marginTop: 0 }}>
        Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
      </p>
      <label htmlFor="email">E-mail</label>
      <input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {erro && <p className="msg-erro">{erro}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? "Enviando..." : "Enviar link"}
      </button>
      <Link href="/login" className="link-simples">
        ‹ Voltar para Entrar
      </Link>
    </form>
  );
}
