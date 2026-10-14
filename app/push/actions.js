"use server";

import { removerInscricaoDe, salvarInscricaoDe } from "../../lib/push";
import { createClient } from "../../lib/supabase/server";

// Liga/desliga os avisos neste aparelho, para quem estiver logado (equipe ou cliente)
export async function ativarAvisos(inscricao) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, erro: "Entre na sua conta para ativar os avisos." };
    await salvarInscricaoDe(user.id, inscricao);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, erro: "Não foi possível ativar os avisos agora." };
  }
}

export async function desativarAvisos(endpoint) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await removerInscricaoDe(user.id, endpoint);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, erro: "Não foi possível desativar." };
  }
}
