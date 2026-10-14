"use client";

import Link from "next/link";
import { useState } from "react";
import { cadastrar } from "./actions";

// Cadastro do cliente da loja: nome e WhatsApp preenchem o carrinho; a conta mostra os pedidos e recebe avisos
export default function Cadastro() {
  const [f, setF] = useState({ nome: "", telefone: "", email: "", senha: "" });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const r = await cadastrar(f); // sucesso sem confirmação de e-mail redireciona e não volta
    setEnviando(false);
    if (r && !r.ok) setErro(r.erro);
    if (r?.confirmar) setConfirmar(true);
  }

  if (confirmar) {
    return (
      <div className="card login">
        <h1>Quase lá!</h1>
        <p className="info">
          Enviamos um link para <strong>{f.email}</strong>. Abra o e-mail, toque no link e depois entre com a sua senha.
        </p>
        <Link href="/login" className="botao-link-cheio">
          Ir para Entrar
        </Link>
      </div>
    );
  }

  return (
    <form className="card login" onSubmit={enviar}>
      <h1>Criar conta</h1>
      <p className="info" style={{ marginTop: 0 }}>
        Acompanhe seus pedidos e receba avisos quando estiverem prontos.
      </p>
      <label htmlFor="nome">Nome</label>
      <input id="nome" autoComplete="name" maxLength={80} required value={f.nome} onChange={set("nome")} />
      <label htmlFor="telefone">WhatsApp com DDD</label>
      <input id="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(54) 99999-0000" maxLength={20} required value={f.telefone} onChange={set("telefone")} />
      <label htmlFor="email">E-mail</label>
      <input id="email" type="email" inputMode="email" autoComplete="email" required value={f.email} onChange={set("email")} />
      <label htmlFor="senha">Senha (mínimo 8)</label>
      <input id="senha" type="password" autoComplete="new-password" minLength={8} required value={f.senha} onChange={set("senha")} />
      {erro && <p className="msg-erro">{erro}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? "Criando..." : "Criar conta"}
      </button>
      <Link href="/login" className="link-simples">
        Já tenho conta: Entrar
      </Link>
      <Link href="/" className="link-simples">
        ‹ Voltar à loja
      </Link>
    </form>
  );
}
