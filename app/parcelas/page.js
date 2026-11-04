import ParcelasClient from "../../components/ParcelasClient";
import { todas } from "../../lib/paginar";
import { agruparCompras, comPermissoes, comprasDoMes, resumoParcelas } from "../../lib/parcelas";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export const metadata = { title: "Parcelas — Lojinha A&G" };

// o servidor roda em UTC; "hoje" precisa ser o dia de Brasília
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// Baixa das parcelas do cartão (mig. 042/043). Gerente vê e mexe em tudo; a sócia vê tudo e mexe nas dela; o vendedor vê e mexe só nas dele.
export default async function Parcelas({ searchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  const veTudo = Boolean(usuario?.gerente) || usuario?.papel === "socia";

  const hoje = hojeBR();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp?.m ?? "") ? sp.m : hoje.slice(0, 7);

  // todas() busca página a página: o PostgREST corta cada resposta em 1000 linhas.
  // À vista nasce recebida na data da venda, então só o cartão entra aqui.
  const { data: linhas } = await todas((a, b) => {
    const q = supabase
      .from("parcelas")
      .select(
        "id, venda_id, numero, vencimento, valor, recebido_em, venda:vendas!inner(id, grupo_id, data, parcelas, pagamento, vendedor_id, recebimentos_meta, cliente_nome, cliente_telefone, produtos(nome), perfis!vendas_vendedor_id_fkey(nome))",
      )
      .eq("venda.pagamento", "cartao")
      .order("id")
      .range(a, b);
    return veTudo ? q : q.eq("vendedor_id", usuario?.id);
  });

  const lista = linhas ?? [];
  return (
    <ParcelasClient
      periodo={{ mes, hoje }}
      resumo={resumoParcelas(lista, hoje, mes)}
      compras={comPermissoes(comprasDoMes(agruparCompras(lista, hoje), mes), { papel: usuario?.papel, usuarioId: usuario?.id })}
      papel={usuario?.papel}
    />
  );
}
