"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { soDigitos, telefoneValido } from "../../lib/pedido";
import { createClient } from "../../lib/supabase/server";

// Cliente corrige o próprio nome e WhatsApp (grant por coluna + policy "editar o próprio perfil")
export async function salvarDados({ nome, telefone }) {
  try {
    const n = String(nome ?? "").trim();
    if (n.length < 2 || n.length > 80) return { ok: false, erro: "Informe seu nome." };
    if (!telefoneValido(telefone)) return { ok: false, erro: "Informe o WhatsApp com DDD." };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, erro: "Sessão expirada. Entre novamente." };
    const { error } = await supabase.from("perfis").update({ nome: n, telefone: soDigitos(telefone) }).eq("id", user.id);
    if (error) throw error;
    revalidatePath("/conta");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
  }
}

export async function sairDaConta() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
