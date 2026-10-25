"use server";

import { redirect } from "next/navigation";
import { inicioDe } from "../../lib/rotas";
import { createClient } from "../../lib/supabase/server";

export async function redefinirSenha({ senha }) {
  if (String(senha ?? "").length < 8) return { ok: false, erro: "A senha precisa de pelo menos 8 caracteres." };

  const supabase = await createClient();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao.user) return { ok: false, erro: "O link expirou. Peça um novo em Esqueci a senha." };

  const { data, error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    if (error.code === "same_password") return { ok: false, erro: "Escolha uma senha diferente da anterior." };
    if (error.code === "weak_password") return { ok: false, erro: "Senha fraca: use letras e números." };
    console.error(error);
    return { ok: false, erro: "Não foi possível trocar a senha. Tente de novo." };
  }
  redirect(inicioDe(data.user));
}
