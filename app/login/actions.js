"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export async function entrar({ email, senha }) {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: (email ?? "").trim(),
    password: senha ?? "",
  });
  // mensagem única: não revela se o e-mail existe
  if (error) return { ok: false, erro: "E-mail ou senha incorretos." };
  redirect("/vendas");
}
