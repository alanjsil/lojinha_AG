"use server";

import { redirect } from "next/navigation";
import { inicioDe } from "../../lib/rotas";
import { createClient } from "../../lib/supabase/server";

export async function entrar({ email, senha }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: (email ?? "").trim(),
    password: senha ?? "",
  });
  // mensagem única: não revela se o e-mail existe
  if (error) return { ok: false, erro: error.code === "email_not_confirmed" ? "Confirme o seu e-mail pelo link que enviamos e tente de novo." : "E-mail ou senha incorretos." };
  // equipe vai para Vendas; cliente para a conta dele
  redirect(inicioDe(data.user));
}
