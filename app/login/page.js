"use client";

import Link from "next/link";
import { useState } from "react";
import { entrar } from "./actions";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEntrando(true);
    // em caso de sucesso a ação redireciona e nunca volta
    const r = await entrar({ email, senha });
    if (r && !r.ok) setErro(r.erro);
    setEntrando(false);
  }

  return (
    <>
      <form className="card login" onSubmit={enviar}>
        <h1>Lojinha A&amp;G</h1>
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="senha">Senha</label>
        <input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <p className="msg-erro">{erro}</p>}
        <button type="submit" disabled={entrando}>
          {entrando ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <div className="card">
        <p className="info" style={{ marginTop: 0 }}>
          É cliente? Crie sua conta para acompanhar os pedidos e receber avisos no celular.
        </p>
        <Link href="/cadastro" className="botao-link-cheio botao-claro">
          Criar conta de cliente
        </Link>
        <Link href="/" className="link-simples">
          ‹ Voltar à loja
        </Link>
      </div>
    </>
  );
}
