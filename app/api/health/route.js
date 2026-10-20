import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Ping de saúde (monitor no PC da loja): confere se o app responde E se o Supabase está de pé.
// Rota pública (fora do matcher do proxy.js); não devolve dado nenhum, só ok/ms.
// Usa a chave anon (a mesma do app). A anon não tem grant em nenhuma tabela, então a consulta volta
// "permissão negada" (42501): é o esperado e prova que a API e o Postgres responderam. Chave/URL
// errada ou banco fora do ar dá outro erro e vira 503.
export async function GET() {
  const t0 = Date.now();
  const sem = { headers: { "Cache-Control": "no-store" } };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return Response.json({ ok: false, erro: "sem config do Supabase" }, { status: 503, ...sem });
  const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.from("vendas").select("id").limit(1);
  if (error && error.code !== "42501") return Response.json({ ok: false, erro: "supabase" }, { status: 503, ...sem });
  return Response.json({ ok: true, supabase_ms: Date.now() - t0 }, sem);
}
