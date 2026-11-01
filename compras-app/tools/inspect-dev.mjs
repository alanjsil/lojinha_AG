// Inspeção SOMENTE LEITURA do banco DEV (Pi). Uso: node --env-file=../.env.local tools/inspect-dev.mjs
import pg from "pg";

const url = process.env.DEV_DB_URL;
if (!url || /supabase\.(co|com)/.test(url)) {
  console.error("DEV_DB_URL ausente ou aponta para a produção. Abortado.");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

const j = await q("select length(current_setting('app.settings.jwt_secret', true)) l");
console.log("jwt_secret no banco do dev: comprimento", j[0].l);

console.log("\n== colunas  (* = obrigatória, (d) = tem default)");
for (const r of await q(
  `select table_name t, string_agg(column_name||':'||data_type||case when is_nullable='NO' then '*' else '' end||case when column_default is not null then '(d)' else '' end, ', ' order by ordinal_position) cols
   from information_schema.columns where table_schema='public' and table_name in ('produtos','compras','despesas') group by 1`,
))
  console.log(r.t + ": " + r.cols);

console.log("\n== INSERT liberado para authenticated (colunas)");
for (const r of await q(
  `select table_name t, string_agg(column_name, ', ' order by column_name) cols
   from information_schema.column_privileges where grantee='authenticated' and table_schema='public'
   and table_name in ('produtos','compras','despesas') and privilege_type='INSERT' group by 1`,
))
  console.log(r.t + ": " + r.cols);

console.log("\n== policies");
for (const r of await q(
  `select tablename t, policyname n, cmd, permissive, coalesce(with_check,qual,'') w from pg_policies
   where schemaname='public' and tablename in ('produtos','compras','despesas') order by 1,3`,
))
  console.log(r.t, "|", r.n, "|", r.cmd, "|", r.permissive, "|", r.w.slice(0, 90));

console.log("\n== triggers");
for (const r of await q(
  `select c.relname t, g.tgname n from pg_trigger g join pg_class c on c.oid=g.tgrelid
   where c.relname in ('produtos','compras','despesas') and not g.tgisinternal order by 1,2`,
))
  console.log(r.t, "|", r.n);

console.log("\n== gerentes");
for (const r of await q("select id, papel from public.perfis where papel='gerente' limit 3")) console.log(r.id, r.papel);

console.log("\n== catálogo (nome | categoria | custo | preço)");
for (const r of await q(
  `select p.nome, coalesce(cat.nome,'-') cat, p.custo, p.preco from public.produtos p
   left join public.categorias cat on cat.id=p.categoria_id where p.ativo order by cat.ordem nulls last, p.nome`,
))
  console.log(`${r.nome} | ${r.cat} | ${r.custo} | ${r.preco}`);

await c.end();
