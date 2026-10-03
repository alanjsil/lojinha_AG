import SaidasClient from "../../components/SaidasClient";
import { somarDias } from "../../lib/formato";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export default async function Saidas() {
  const supabase = createClient();
  const usuario = await usuarioAtual(supabase);
  const desde = somarDias(new Date().toLocaleDateString("sv-SE"), -30);

  const [{ data: produtos }, { data: compras }, { data: despesas }] =
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
    ]);

  return (
    <>
      <h1>Saídas</h1>
      <SaidasClient
        produtos={(produtos ?? []).map((p) => ({
          ...p,
          custo: Number(p.custo),
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
