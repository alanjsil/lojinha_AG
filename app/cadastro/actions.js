"use server";

import { redirect } from "next/navigation";
import { soDigitos, telefoneValido } from "../../lib/pedido";
import { createClient } from "../../lib/supabase/server";

// Cadastro aberto = sempre cliente (o trigger criar_perfil ignora qualquer papel vindo daqui;
// papel da equipe só pelo app_metadata, que só o admin grava).
export async function cadastrar({ nome, telefone, email, senha }) {
  const n = String(nome ?? "").trim();
  const e = String(email ?? "").trim();

  if (n.length < 2 || n.length > 80) return { ok: false, erro: "Informe seu nome." };
  if (!telefoneValido(telefone)) return { ok: false, erro: "Informe o WhatsApp com DDD." };
  if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, erro: "E-mail inválido." };
  if (String(senha ?? "").length < 8) return { ok: false, erro: "A senha precisa de pelo menos 8 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: e,
    password: senha,
    options: { data: { nome: n, telefone: soDigitos(telefone) } },
  });

  if (error) {
    if (error.code === "user_already_exists") return { ok: false, erro: "Já existe uma conta com esse e-mail. Use Entrar." };
    if (error.code === "weak_password") return { ok: false, erro: "Senha fraca: use letras e números." };
    if (error.code === "over_email_send_rate_limit") return { ok: false, erro: "Muitos cadastros agora. Tente de novo em alguns minutos." };
    // confirmação de e-mail ligada no Supabase sem servidor de e-mail (SMTP) configurado
    if (error.status === 500 && /email/i.test(error.message)) {
      console.error("cadastro: falha ao enviar o e-mail de confirmação (SMTP do Supabase Auth)", error.message);
      return { ok: false, erro: "Não conseguimos enviar o e-mail de confirmação agora. Chame a loja no WhatsApp." };
    }
    console.error(error);
    return { ok: false, erro: "Não foi possível criar a conta. Tente de novo." };
  }

  // com confirmação de e-mail ligada no Supabase, a sessão só vem depois do link
  if (!data.session) return { ok: true, confirmar: true };
  redirect("/conta");
}
