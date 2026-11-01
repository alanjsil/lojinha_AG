// Gera tests/fixtures/catalogo.json com ids, nomes e preços de venda (sem custo) lidos do banco DEV.
// Uso: node --env-file=../.env.local tools/gerar-fixture.mjs   (SOMENTE LEITURA)
import pg from "pg";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const url = process.env.DEV_DB_URL;
if (!url || /supabase\.(co|com)/.test(url)) {
  console.error("DEV_DB_URL ausente ou aponta para a produção. Abortado.");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url });
await c.connect();
const categorias = (await c.query("select id, nome, ordem, ativo from public.categorias order by ordem")).rows;
const produtos = (
  await c.query("select id, nome, preco::float8 as preco, categoria_id from public.produtos where ativo order by nome")
).rows;
await c.end();

const saida = fileURLToPath(new URL("../tests/fixtures/catalogo.json", import.meta.url));
writeFileSync(saida, JSON.stringify({ categorias, produtos }, null, 1) + "\n", "utf8");
console.log("catalogo.json:", categorias.length, "categorias,", produtos.length, "produtos");
