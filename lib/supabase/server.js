import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente do Supabase para Server Components e Server Actions. Roda como o usuário logado
// (cookie de sessão), então as políticas RLS do banco valem para tudo que o app faz.
export function createClient() {
  const jar = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(lista) {
          try {
            lista.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            // Server Component não grava cookie; o middleware já renova a sessão
          }
        },
      },
    },
  );
}

// Usuário logado + perfil (nome, % de comissão). Redireciona/recusa se não houver sessão.
export async function usuarioAtual(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome, comissao_pct")
    .eq("id", user.id)
    .single();
  return {
    id: user.id,
    email: user.email,
    nome: perfil?.nome ?? user.email,
    comissaoPct: Number(perfil?.comissao_pct ?? 0),
  };
}
