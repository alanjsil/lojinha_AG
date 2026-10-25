import SaidasClient from "../../components/SaidasClient";
import { somarDias } from "../../lib/formato";
import { PAPEIS_EQUIPE } from "../../lib/rotas";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export default async function Saidas() {
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  const desde = somarDias(new Date().toLocaleDateString("sv-SE"), -30);

  const [{ data: despesas }, { data: lancamentos }, { data: vendedores }, { data: cartoes }] = await Promise.all([
    supabase
      .from("despesas")
      .select("id, data, tipo, descricao, valor, cartao_id, parcelas")
      .gte("data", desde)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    usuario?.gerente
      ? supabase
          .from("lancamentos")
          .select("id, data, tipo, valor, descricao, vendedor_id, perfis!lancamentos_vendedor_id_fkey(nome)")
          .gte("data", desde)
          .order("data", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    usuario?.gerente ? supabase.from("perfis").select("id, nome").in("papel", PAPEIS_EQUIPE).order("nome") : Promise.resolve({ data: [] }),
    supabase.from("cartoes").select("id, nome, dia_fechamento, dia_vencimento, ativo").order("ativo", { ascending: false }).order("nome"),
  ]);

  if (!usuario?.gerente)
    return (
      <>
        <h1>Saídas</h1>
        <div className="card">
          <p className="vazio">Despesas e lançamentos são só do gerente. Compras de mercadoria ficam em Estoque.</p>
        </div>
      </>
    );

  return (
    <>
      <h1>Saídas</h1>
      <SaidasClient
        despesas={(despesas ?? []).map((d) => ({
          ...d,
          valor: Number(d.valor),
        }))}
        lancamentos={(lancamentos ?? []).map((l) => ({
          id: l.id,
          data: l.data,
          tipo: l.tipo,
          descricao: l.descricao,
          valor: Number(l.valor),
          vendedor: l.perfis?.nome ?? null,
          vendedorId: l.vendedor_id,
        }))}
        vendedores={vendedores ?? []}
        cartoes={cartoes ?? []}
      />
    </>
  );
}
