// Checagem estática de web/index.html: sintaxe do JS e ids usados em $('x') x ids existentes no HTML.
// Uso: node tools/checar-web.js
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const arq = path.join(__dirname, "..", "web", "index.html");
const html = fs.readFileSync(arq, "utf8");
const blocos = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!blocos.length) {
  console.error("nenhum <script> inline encontrado");
  process.exit(1);
}
let erros = 0;
for (const [i, codigo] of blocos.entries()) {
  try {
    new vm.Script(codigo, { filename: "index.html#script" + i });
  } catch (e) {
    console.error("SINTAXE:", e.message);
    erros++;
  }
}
const js = blocos.join("\n");
const usados = new Set([...js.matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]));
const existentes = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
// ids criados em tempo de execução (dentro de innerHTML) não existem no HTML estático
const dinamicos = new Set(["bDol", "lEmail", "lSenha", "bEntrar", "bSair", "pvDepara"]);
for (const id of usados) {
  if (!existentes.has(id) && !dinamicos.has(id)) {
    console.error("ID FALTANDO no HTML:", id);
    erros++;
  }
}
const duplicados = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]).filter((x, i, a) => a.indexOf(x) !== i);
if (duplicados.length) {
  console.error("IDs DUPLICADOS:", [...new Set(duplicados)].join(", "));
  erros++;
}
console.log(erros ? erros + " problema(s)" : "web/index.html OK: sintaxe, " + usados.size + " ids usados, " + existentes.size + " ids no HTML");
process.exit(erros ? 1 : 0);
