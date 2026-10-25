import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Destino do link do e-mail de recuperação: troca o token por sessão (cookie) e abre a tela de nova senha.
// O destino é fixo, nunca vem da URL.
export async function GET(req) {
  const { searchParams, origin } = new URL(req.url);
  const tokenHash = searchParams.get("token_hash");

  if (tokenHash && searchParams.get("type") === "recovery") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/redefinir-senha", origin));
  }
  return NextResponse.redirect(new URL("/esqueci-senha", origin));
}
