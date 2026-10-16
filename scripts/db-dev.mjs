// Migrações no banco DEV (rede local). A URL com a senha vem de DEV_DB_URL no .env.local (fora do git).
// Uso: npm run db:dev:dry | db:dev | db:dev:list
import { spawnSync } from "node:child_process";

const comandos = {
  dry: ["db", "push", "--dry-run"],
  push: ["db", "push"],
  list: ["migration", "list"],
};

const url = process.env.DEV_DB_URL;
const args = comandos[process.argv[2]];

if (!args) {
  console.error(`Comando desconhecido. Use: ${Object.keys(comandos).join(" | ")}`);
  process.exit(1);
}
if (!url) {
  console.error("Falta DEV_DB_URL no .env.local (veja o .env.example).");
  process.exit(1);
}

const r = spawnSync("npx", ["supabase", ...args, "--db-url", `"${url}"`], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
