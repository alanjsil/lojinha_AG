import SaidasClient from "../../components/SaidasClient";
import { somarDias } from "../../lib/formato";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export default async function Saidas() {
  const supabase = createClient();
  const usuario = await usuarioAtual(supabase);
  const desde = somarDias(new Date().toLocaleDateString("sv-SE"), -30);

  const [
    { data: produtos },
    { data: compras },
    { data: despesas },
    { data: historico },
  ] =
    await Promise.all([
      supabase
        .from("produtos")
        .select("id, nome, custo")
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("compras")
        .select("id, data, quantidade, custo_unit, fornecedor, produtos(nome)")
        .gte("data", desde)
        .order("data", { ascending: false })
        .limit(100),
      usuario?.gerente
        ? supabase
            .from("despesas")
            .select("id, data, tipo, descricao, valor")
            .gte("data", desde)
            .order("data", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] }),
      // sem filtro de data: o último custo de compra pode ser antigo
      supabase
        .from("compras")
        .select("produto_id, custo_unit")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const ultimoCusto = {};
  for (const c of historico ?? [])
    if (!(c.produto_id in ultimoCusto))
      ultimoCusto[c.produto_id] = Number(c.custo_unit);

  return (
    <>
      <h1>Saídas</h1>
      <SaidasClient
        produtos={(produtos ?? []).map((p) => ({
          ...p,
          custo: Number(p.custo),
          ultimoCusto: ultimoCusto[p.id] ?? null,
        }))}
        compras={(compras ?? []).map((c) => ({
          ...c,
          quantidade: Number(c.quantidade),
          custo_unit: Number(c.custo_unit),
          produto: c.produtos?.nome ?? "Produto",
        }))}
        despesas={(despesas ?? []).map((d) => ({
          ...d,
          valor: Number(d.valor),
        }))}
        gerente={Boolean(usuario?.gerente)}
      />
    </>
  );
}
