"use server";

import { createClient } from "../../lib/supabase/server";

// Resposta sempre igual: não revela se o e-mail tem conta. O link do e-mail (template "Reset Password"
// do Supabase) aponta para /auth/confirmar, que abre a sessão e leva a /redefinir-senha.
export async function pedirRecuperacao({ email }) {
  const e = String(email ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, erro: "E-mail inválido." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(e);

  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { ok: false, erro: "Muitos pedidos agora. Tente de novo em alguns minutos." };
    }
    // SMTP fora do ar ou mal configurado: o usuário não pode resolver, mas o log mostra
    if (error.status === 500) {
      console.error("recuperação: falha ao enviar o e-mail (SMTP do Supabase Auth)", error.message);
      return { ok: false, erro: "Não conseguimos enviar o e-mail agora. Chame a loja no WhatsApp." };
    }
    console.error(error);
  }
  return { ok: true };
}
