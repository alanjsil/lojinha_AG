import { redirect } from "next/navigation";
import CrmClient from "../../components/CrmClient";
import { clientes, funil, noPeriodo, recorrencia, seriePedidos, sumidos } from "../../lib/crm";
import { somarDias } from "../../lib/formato";
import { todas } from "../../lib/paginar";
import { linkWhatsApp } from "../../lib/pedido";
import { periodoPainel, PERIODOS_PAINEL } from "../../lib/painel";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export const metadata = { title: "CRM — Lojinha A&G" };

// o servidor roda em UTC; "hoje" e o dia do pedido precisam ser de Brasília
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diaBR = (ts) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// CRM para tela grande: gerente e sócia (mesmo acesso do Painel). Cliente = quem foi informado na venda (mig. 038).
export default async function Crm({ searchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  if (!usuario?.gerente && usuario?.papel !== "socia") redirect("/resumos");

  const hoje = hojeBR();
  const p = PERIODOS_PAINEL[sp?.p] ? sp.p : "mes";
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp?.m ?? "") ? sp.m : hoje.slice(0, 7);
  const { de, ate, por } = periodoPainel(p, hoje, mes);

  // todas() busca página a página: o PostgREST corta cada resposta em 1000 linhas
  const [{ data: comCliente }, { data: doPeriodo }, { data: pedidos }] = await Promise.all([
    // histórico inteiro de quem tem cliente: 1ª/última compra e sumidos dependem de tudo
    todas((a, b) =>
      supabase
        .from("vendas")
        .select("id, grupo_id, data, quantidade, preco_unit, lucro, cliente_nome, cliente_telefone, cliente_id, produtos(nome)")
        .or("cliente_telefone.not.is.null,cliente_nome.not.is.null,cliente_id.not.is.null")
        .lte("data", hoje)
        .order("id")
        .range(a, b),
    ),
    // todas as vendas do período, só para saber quantas ficaram sem cliente
    todas((a, b) => supabase.from("vendas").select("id, grupo_id, cliente_nome, cliente_telefone, cliente_id").gte("data", de).lte("data", ate).order("id").range(a, b)),
    // um dia de folga antes: o criado_em é UTC e o dia que vale é o de Brasília
    todas((a, b) =>
      supabase
        .from("pedidos")
        .select("id, criado_em, status, status_em, total")
        .gte("criado_em", `${somarDias(de, -1)}T00:00:00Z`)
        .order("id")
        .range(a, b),
    ),
  ]);

  const lista = clientes(comCliente ?? []);
  const vendasPeriodo = new Map();
  for (const v of doPeriodo ?? []) {
    const chave = v.grupo_id ?? v.id;
    vendasPeriodo.set(chave, vendasPeriodo.get(chave) || Boolean(v.cliente_id || v.cliente_telefone || v.cliente_nome));
  }
  const nVendas = vendasPeriodo.size;
  const nSemCliente = [...vendasPeriodo.values()].filter((tem) => !tem).length;
  const ped = (pedidos ?? []).map((x) => ({ ...x, dia: diaBR(x.criado_em) }));
  const s = sumidos(lista, hoje);

  // só dados para o client (nada de função); WhatsApp já vira link aqui
  const enxuto = (c) => {
    const np = noPeriodo(c, de, ate);
    return {
      chave: c.chave,
      nome: c.nome,
      telefone: c.telefone,
      conta: c.conta,
      whatsapp: c.telefone ? linkWhatsApp(c.telefone, `Olá, ${c.nome.split(" ")[0]}! Aqui é da Lojinha A&G.`) : null,
      total: c.total,
      nCompras: c.nCompras,
      ticket: c.ticket,
      primeira: c.primeira,
      ultima: c.ultima,
      noPeriodo: np.gasto,
      comprasPeriodo: np.compras,
      produtos: c.produtos.slice(0, 8),
    };
  };
  const faixa = (l) => l.slice(0, 15).map((c) => ({ ...enxuto(c), dias: c.dias }));

  return (
    <CrmClient
      periodo={{ p, mes, de, ate, por, hoje }}
      clientes={lista.map(enxuto)}
      recorrencia={recorrencia(lista, de, ate)}
      semCliente={{ n: nSemCliente, total: nVendas }}
      sumidos={{ d30: faixa(s.d30), d60: faixa(s.d60), d90: faixa(s.d90), n30: s.d30.length, n60: s.d60.length, n90: s.d90.length }}
      funil={funil(ped, de, ate)}
      seriePedidos={seriePedidos(
        ped.filter((x) => x.dia >= de && x.dia <= ate),
        de,
        ate,
        por,
      )}
    />
  );
}
