import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a service role: ignora a RLS. Só para o que nenhum usuário pode fazer sozinho
// (ler as inscrições de push de outras pessoas para avisar). Nunca importe em componente client.
export function criarAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
