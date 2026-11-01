// O que o app gravou no banco DEV (Pi) e quem tentou entrar. SOMENTE LEITURA.
// Uso: node --env-file=../.env.local tools/ver-envio-dev.mjs [horas=6]
import pg from "pg";

const url = process.env.DEV_DB_URL;
if (!url || /supabase\.(co|com)/.test(url)) {
  console.error("DEV_DB_URL ausente ou aponta para a produção. Abortado.");
  process.exit(1);
}
const horas = Number(process.argv[2]) || 6;
const c = new pg.Client({ connectionString: url });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
const intervalo = `now() - interval '${horas} hours'`;
const dia = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const brl = (n) => Number(n).toFixed(2);

console.log(`== gravado nas últimas ${horas}h (created_at)`);
for (const t of ["produtos", "compras", "despesas"]) {
  const r = await q(`select count(*)::int n from public.${t} where created_at > ${intervalo}`);
  console.log(t.padEnd(10), r[0].n);
}

console.log("\n== compras (data | produto | qtd x custo_unit = total | custo do produto agora | saldo agora)");
let total = 0;
const datas = new Set();
for (const r of await q(
  `select c.data, p.nome, c.quantidade::float8 qtd, c.custo_unit::float8 cu, p.custo::float8 custo_prod,
          public.saldo_do_produto(p.id)::float8 saldo
   from public.compras c join public.produtos p on p.id=c.produto_id
   where c.created_at > ${intervalo} and c.apagado_em is null order by c.created_at`,
)) {
  const t = Math.round(r.qtd * r.cu * 100) / 100;
  total += t;
  datas.add(dia(r.data));
  console.log(`${dia(r.data)} | ${r.nome} | ${r.qtd} x ${r.cu} = ${brl(t)} | custo ${brl(r.custo_prod)} | saldo ${r.saldo}`);
}
console.log("datas das compras:", [...datas].join(", "), "| total compras:", brl(total));

console.log("\n== despesas (data | tipo | descrição | valor)");
let totalDesp = 0;
for (const r of await q(`select data, tipo, descricao, valor::float8 v from public.despesas where created_at > ${intervalo} and apagado_em is null order by created_at`)) {
  totalDesp += r.v;
  console.log(`${dia(r.data)} | ${r.tipo} | ${r.descricao} | ${brl(r.v)}`);
}
console.log("total despesas:", brl(totalDesp), "| compras + despesas:", brl(total + totalDesp));

console.log("\n== saídas geradas (saidas_parcelas)");
const sc = await q(
  `select count(*)::int n, min(sp.vencimento) mn, max(sp.vencimento) mx, coalesce(sum(sp.valor),0)::float8 s, max(sp.numero) nmax
   from public.saidas_parcelas sp join public.compras c on c.id=sp.compra_id where c.created_at > ${intervalo}`,
);
console.log("das compras :", sc[0].n, "parcelas | vencimento", dia(sc[0].mn), "a", dia(sc[0].mx), "| soma", brl(sc[0].s), "| maior nº parcela", sc[0].nmax);
const sd = await q(
  `select count(*)::int n, min(sp.vencimento) mn, max(sp.vencimento) mx, coalesce(sum(sp.valor),0)::float8 s
   from public.saidas_parcelas sp join public.despesas d on d.id=sp.despesa_id where d.created_at > ${intervalo}`,
);
console.log("das despesas:", sd[0].n, "parcelas | vencimento", dia(sd[0].mn), "a", dia(sd[0].mx), "| soma", brl(sd[0].s));

console.log("\n== produtos criados nas últimas horas (custo | preço | saldo)");
for (const r of await q(
  `select nome, custo::float8 custo, preco::float8 preco, public.saldo_do_produto(id)::float8 saldo, categoria_id is not null tem_cat
   from public.produtos where created_at > ${intervalo} order by created_at`,
))
  console.log(`${r.nome} | custo ${brl(r.custo)} | preço ${brl(r.preco)} | saldo ${r.saldo} | categoria ${r.tem_cat ? "ok" : "FALTA"}`);

console.log("\n== auditoria (últimas ações por tabela)");
for (const r of await q(`select tabela, acao, count(*)::int n from public.log_auditoria where quando > ${intervalo} group by 1,2 order by 1,2`))
  console.log(`${r.tabela} | ${r.acao} | ${r.n}`);

console.log("\n== logins recentes");
try {
  for (const r of await q(`select created_at, payload->>'action' as acao from auth.audit_log_entries where created_at > ${intervalo} order by created_at desc limit 5`))
    console.log(`${new Date(r.created_at).toISOString()} | ${r.acao}`);
} catch (e) {
  console.log("sem acesso:", e.message);
}
await c.end();
