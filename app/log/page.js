import Link from "next/link";
import LogClient from "../../components/LogClient";
import { ACOES_LOG, aindaApagados, mudancas, resumoRegistro, TABELAS_LOG } from "../../lib/log";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

const quandoBR = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Log(props) {
  const searchParams = await props.searchParams;
  const t = TABELAS_LOG[searchParams?.t] ? searchParams.t : null;

  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  if (!usuario?.gerente) {
    return (
      <>
        <h1>Histórico</h1>
        <p className="vazio">Só o gerente vê o histórico de alterações.</p>
      </>
    );
  }

  let consulta = supabase.from("log_auditoria").select("id, quando, tabela, registro_id, acao, antes, depois, perfis(nome)").order("id", { ascending: false }).limit(200);
  if (t) consulta = consulta.eq("tabela", t);

  const [{ data: entradas }, { data: produtos }] = await Promise.all([consulta, supabase.from("produtos").select("id, nome").limit(1000)]);
  const nomes = new Map((produtos ?? []).map((p) => [p.id, p.nome]));
  const nomeProduto = (id) => nomes.get(id) ?? "Produto";
  const apagados = aindaApagados(entradas ?? []);

  const itens = (entradas ?? []).map((e) => {
    const linha = e.acao === "apagou" ? e.antes : e.depois;
    const resumo = e.acao === "editou" ? "" : resumoRegistro(e.tabela, linha, nomeProduto);
    return {
      id: e.id,
      titulo: `${TABELAS_LOG[e.tabela] ?? e.tabela}${resumo ? ` · ${resumo}` : ""}`,
      sub: `${e.perfis?.nome ?? "Sistema"} · ${quandoBR(e.quando)}`,
      acao: e.acao,
      acaoRotulo: ACOES_LOG[e.acao] ?? e.acao,
      detalhes: e.acao === "editou" ? mudancas(e.antes, e.depois) : [],
      tabela: e.tabela,
      registroId: e.registro_id,
      // só a entrada "apagou" mais recente de um registro que continua apagado
      restauravel: e.acao === "apagou" && apagados.has(e.registro_id) && e.id === (entradas ?? []).find((x) => x.registro_id === e.registro_id)?.id,
    };
  });

  return (
    <>
      <h1>Histórico</h1>
      <div className="segmentos" style={{ flexWrap: "wrap" }}>
        <Link href="/log" className={t ? "" : "ativo"}>
          Tudo
        </Link>
        {Object.entries(TABELAS_LOG).map(([k, r]) => (
          <Link key={k} href={`/log?t=${k}`} className={t === k ? "ativo" : ""}>
            {r}
          </Link>
        ))}
      </div>
      <div className="card">
        <LogClient itens={itens} />
        <p className="info">Últimas 200 alterações. Apagar é lógico: o registro some das telas e pode ser restaurado aqui.</p>
      </div>
      <Link href="/resumos" className="botao-secundario" style={{ display: "block", textAlign: "center" }}>
        Voltar ao Resumos
      </Link>
    </>
  );
}
