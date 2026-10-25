// Apaga os dados do banco DEV (rede local) e copia os da produção. A produção só é lida.
// Uso: npm run db:dev:clonar [-- --sim]   (sem --sim pede confirmação)
// Precisa no .env.local: DEV_DB_URL e SENHA_POSTGRESS_SUPA_ONLINE (ou PROD_DB_URL completa).
// O schema não é tocado: aplique as migrações antes (npm run db:dev).
import pg from "pg";
import readline from "node:readline/promises";

const PROD_REF = "modldgphwfzjarydzolx";
const { DEV_DB_URL, PROD_DB_URL, SENHA_POSTGRESS_SUPA_ONLINE } = process.env;

if (!DEV_DB_URL) sair("Falta DEV_DB_URL no .env.local.");
if (/supabase\.(co|com)/.test(DEV_DB_URL) || DEV_DB_URL.includes(PROD_REF)) sair("DEV_DB_URL parece apontar para a produção. Abortado.");
if (!PROD_DB_URL && !SENHA_POSTGRESS_SUPA_ONLINE) sair("Falta SENHA_POSTGRESS_SUPA_ONLINE (ou PROD_DB_URL) no .env.local.");

function sair(msg) {
  console.error(msg);
  process.exit(1);
}

const urlsProd = PROD_DB_URL
  ? [PROD_DB_URL]
  : [0, 1].map(
      (n) =>
        `postgresql://postgres.${PROD_REF}:${encodeURIComponent(SENHA_POSTGRESS_SUPA_ONLINE)}@aws-${n}-sa-east-1.pooler.supabase.com:5432/postgres`,
    );

const q = (n) => `"${n}"`;
const authLimpar = [
  "auth.mfa_amr_claims", "auth.mfa_challenges", "auth.mfa_factors", "auth.refresh_tokens", "auth.sessions",
  "auth.one_time_tokens", "auth.flow_state", "auth.identities", "auth.users",
];

async function conectarProd() {
  let ultimo;
  for (const u of urlsProd) {
    const c = new pg.Client({ connectionString: u, ssl: { rejectUnauthorized: false } });
    try {
      await c.connect();
      return c;
    } catch (e) {
      ultimo = e;
    }
  }
  return sair(`Não conectei na produção: ${ultimo.message}`);
}

async function colunas(c, tabela) {
  const [s, t] = tabela.split(".");
  const r = await c.query(
    "select column_name from information_schema.columns where table_schema=$1 and table_name=$2 and is_generated='NEVER' order by ordinal_position",
    [s, t],
  );
  return r.rows.map((x) => x.column_name);
}

const dev = new pg.Client({ connectionString: DEV_DB_URL });
await dev.connect();
const host = new URL(DEV_DB_URL).host;

if (!process.argv.includes("--sim")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question(`Apagar TODOS os dados de ${host} e copiar da produção? (digite "sim") `);
  rl.close();
  if (r.trim().toLowerCase() !== "sim") sair("Cancelado.");
}

const prod = await conectarProd();
await prod.query("begin read only");

const pub = (
  await dev.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")
).rows.map((r) => `public.${r.table_name}`);
const copiar = [...pub, "auth.users", "auth.identities", "storage.buckets"];

await dev.query("begin");
try {
  // replica = triggers e FKs desligados: as linhas entram exatamente como estão na produção
  await dev.query("set local session_replication_role = replica");
  for (const t of [...pub, ...authLimpar, "storage.objects", "storage.buckets"]) await dev.query(`delete from ${t}`);

  for (const t of copiar) {
    const doProd = new Set(await colunas(prod, t));
    const cols = (await colunas(dev, t)).filter((c) => doProd.has(c));
    const lista = cols.map(q).join(",");
    // JSON em texto direto do Postgres: o driver do Node cortaria os microssegundos dos timestamps
    const r = (
      await prod.query(`select count(*)::int n, coalesce(json_agg(x),'[]'::json)::text j from (select ${lista} from ${t}) x`)
    ).rows[0];
    if (r.n) {
      await dev.query(
        `insert into ${t} (${lista}) overriding system value select ${lista} from json_populate_recordset(null::${t}, $1::json)`,
        [r.j],
      );
    }
    console.log(t.padEnd(28), r.n);
  }

  const seqs = (
    await dev.query(
      `select pg_get_serial_sequence(quote_ident(table_schema)||'.'||quote_ident(table_name), column_name) s, table_schema, table_name, column_name
       from information_schema.columns where table_schema in ('public','auth') and (is_identity='YES' or column_default like 'nextval%')`,
    )
  ).rows.filter((r) => r.s);
  for (const r of seqs) {
    await dev.query(`select setval($1, coalesce((select max(${q(r.column_name)}) from ${r.table_schema}.${r.table_name}),0)+1, false)`, [r.s]);
  }

  await dev.query("commit");
  console.log(`\nPronto: ${host} agora tem os dados da produção.`);
} catch (e) {
  await dev.query("rollback");
  console.error(`\nErro, o dev ficou como estava: ${e.message}`);
  process.exitCode = 1;
}
await prod.query("rollback");
await prod.end();
await dev.end();
