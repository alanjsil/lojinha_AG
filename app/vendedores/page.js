import Link from "next/link";
import VendedoresClient from "../../components/VendedoresClient";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export default async function Vendedores() {
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  if (!usuario?.gerente && usuario?.papel !== "socia") {
    return (
      <>
        <h1>Vendedores</h1>
        <p className="vazio">Só o gerente e a sócia cadastram vendedores.</p>
      </>
    );
  }

  const { data: vendedores } = await supabase.from("perfis").select("id, nome, telefone, comissao_pct").eq("papel", "vendedor").order("nome");

  return (
    <>
      <h1>Vendedores</h1>
      <VendedoresClient vendedores={vendedores ?? []} />
      <Link href="/resumos" className="botao-secundario" style={{ display: "block", textAlign: "center" }}>
        Voltar ao Resumos
      </Link>
    </>
  );
}
