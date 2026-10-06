import Link from "next/link";
import GraficoBarras from "../../components/GraficoBarras";
import { brl, qtd, somarDias } from "../../lib/formato";
import { createClient, usuarioAtual } from "../../lib/supabase/server";
import { sair } from "../actions";

const PERIODOS = { dia: "Hoje", semana: "7 dias", mes: "Este mês" };

// o servidor roda em UTC; "hoje" precisa ser o dia de Brasília
const hojeBR = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

function intervalo(p, fim) {
  if (p === "dia") return fim;
  if (p === "semana") return somarDias(fim, -6);
  return fim.slice(0, 8) + "01";
}

function diasEntre(de, ate) {
  const dias = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

export default async function Resumos({ searchParams }) {
  const p = PERIODOS[searchParams?.p] ? searchParams.p : "semana";
  const ate = hojeBR();
  const de = intervalo(p, ate);

  const supabase = createClient();
  const usuario = await usuarioAtual(supabase);
  const gerente = Boolean(usuario?.gerente);

  let consultaVendas = supabase
    .from("vendas")
    .select(
      "data, quantidade, preco_unit, custo_unit, lucro, vendedor_id, produto_id, produtos(nome), perfis(nome)",
    )
    .gte("data", de)
    .lte("data", ate)
    .limit(5000);
  if (!gerente) consultaVendas = consultaVendas.eq("vendedor_id", usuario?.id);

  // a comissão cai junto com cada parcela: conta no vencimento, não na data da venda
  let consultaParcelas = supabase
    .from("parcelas")
    .select("comissao, vendedor_id, perfis(nome)")
    .gte("vencimento", de)
    .lte("vencimento", ate)
    .limit(5000);
  if (!gerente)
    consultaParcelas = consultaParcelas.eq("vendedor_id", usuario?.id);

  const [{ data: vendas }, { data: parcelas }, { data: despesas }] =
    await Promise.all([
      consultaVendas,
      consultaParcelas,
      gerente
        ? supabase
            .from("despesas")
            .select("valor")
            .gte("data", de)
            .lte("data", ate)
            .limit(5000)
        : Promise.resolve({ data: [] }),
    ]);

  const total = { vendas: 0, custo: 0, lucro: 0, comissoes: 0 };
  const porDia = new Map(
    diasEntre(de, ate).map((d) => [d, { data: d, vendas: 0, lucro: 0 }]),
  );
  const porVendedor = new Map();
  const porProduto = new Map();

  for (const v of vendas ?? []) {
    const receita = Number(v.quantidade) * Number(v.preco_unit);
    const custo = Number(v.quantidade) * Number(v.custo_unit);
    const lucro = Number(v.lucro);
    total.vendas += receita;
    total.custo += custo;
    total.lucro += lucro;

    const dia = porDia.get(v.data);
    if (dia) {
      dia.vendas += receita;
      dia.lucro += lucro;
    }
    const vend = porVendedor.get(v.vendedor_id) ?? {
      nome: v.perfis?.nome ?? "-",
      n: 0,
      vendas: 0,
      lucro: 0,
      comissao: 0,
    };
    vend.n += 1;
    vend.vendas += receita;
    vend.lucro += lucro;
    porVendedor.set(v.vendedor_id, vend);

    const prod = porProduto.get(v.produto_id) ?? {
      nome: v.produtos?.nome ?? "-",
      quantidade: 0,
      lucro: 0,
    };
    prod.quantidade += Number(v.quantidade);
    prod.lucro += lucro;
    porProduto.set(v.produto_id, prod);
  }

  for (const pc of parcelas ?? []) {
    const comissao = Number(pc.comissao);
    total.comissoes += comissao;
    const vend = porVendedor.get(pc.vendedor_id) ?? {
      nome: pc.perfis?.nome ?? "-",
      n: 0,
      vendas: 0,
      lucro: 0,
      comissao: 0,
    };
    vend.comissao += comissao;
    porVendedor.set(pc.vendedor_id, vend);
  }

  const totalDespesas = (despesas ?? []).reduce(
    (s, d) => s + Number(d.valor),
    0,
  );
  const liquido = total.lucro - total.comissoes - totalDespesas;

  // % sobre a receita e % sobre o lucro bruto (vazio quando a base é zero)
  const pct = (v, base) => (base > 0 ? `${qtd((v / base) * 100)}%` : "–");
  const linhasDre = [
    { item: "Receita", valor: total.vendas },
    { item: "Custo das mercadorias", valor: total.custo },
    { item: "Lucro bruto", valor: total.lucro, forte: true },
    { item: gerente ? "Comissões" : "Sua comissão", valor: total.comissoes },
    ...(gerente
      ? [
          { item: "Despesas", valor: totalDespesas },
          { item: "Lucro líquido", valor: liquido, forte: true },
        ]
      : []),
  ];
  const vendedores = [...porVendedor.values()].sort(
    (a, b) => b.comissao - a.comissao,
  );
  const maisVendidos = [...porProduto.values()]
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 5);

  return (
    <>
      <h1>Resumos</h1>
      <div className="segmentos">
        {Object.entries(PERIODOS).map(([k, r]) => (
          <Link
            key={k}
            href={`/resumos?p=${k}`}
            className={p === k ? "ativo" : ""}
          >
            {r}
          </Link>
        ))}
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="rotulo">Vendas</div>
          <div className="numero">{brl(total.vendas)}</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Lucro bruto</div>
          <div className="numero positivo">{brl(total.lucro)}</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Comissões</div>
          <div className="numero">{brl(total.comissoes)}</div>
        </div>
        {gerente && (
          <div className="kpi">
            <div className="rotulo">Despesas</div>
            <div className="numero">{brl(totalDespesas)}</div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Demonstrativo</h2>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th>Valor</th>
                <th>% receita</th>
                <th>% lucro</th>
              </tr>
            </thead>
            <tbody>
              {linhasDre.map((l) => (
                <tr key={l.item} className={l.forte ? "forte" : ""}>
                  <td>{l.item}</td>
                  <td className={l.valor < 0 ? "negativo" : ""}>
                    {brl(l.valor)}
                  </td>
                  <td>{pct(l.valor, total.vendas)}</td>
                  <td>{pct(l.valor, total.lucro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {gerente && (
        <div className="card">
          <ul className="lista">
            <li>
              <span className="titulo">Lucro líquido</span>
              <span
                className={`valor ${liquido < 0 ? "negativo" : "positivo"}`}
              >
                {brl(liquido)}
              </span>
            </li>
          </ul>
          <p className="info">
            Lucro líquido = lucro bruto − comissões − despesas. As comissões
            contam no vencimento de cada parcela (venda no cartão parcelada paga
            a comissão aos poucos). A mercadoria já entra no lucro pelo custo de
            cada venda; por isso as compras não são subtraídas de novo.
          </p>
        </div>
      )}

      {p !== "dia" && (
        <div className="card">
          <h2>Por dia</h2>
          <GraficoBarras dados={[...porDia.values()]} />
        </div>
      )}

      {gerente && (
        <div className="card">
          <h2>Comissão por vendedor</h2>
          {vendedores.length === 0 ? (
            <p className="vazio">Sem vendas no período.</p>
          ) : (
            <ul className="lista">
              {vendedores.map((v) => (
                <li key={v.nome}>
                  <div>
                    <div className="titulo">{v.nome}</div>
                    <div className="sub">
                      {v.n} {v.n === 1 ? "venda" : "vendas"} · lucro{" "}
                      {brl(v.lucro)}
                    </div>
                  </div>
                  <div className="valor">{brl(v.comissao)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <h2>Mais vendidos</h2>
        {maisVendidos.length === 0 ? (
          <p className="vazio">Sem vendas no período.</p>
        ) : (
          <ul className="lista">
            {maisVendidos.map((m) => (
              <li key={m.nome}>
                <div>
                  <div className="titulo">{m.nome}</div>
                  <div className="sub">lucro {brl(m.lucro)}</div>
                </div>
                <div className="valor">{qtd(m.quantidade)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <p className="info" style={{ marginTop: 0 }}>
          Conectado como <strong>{usuario?.nome}</strong> · comissão{" "}
          {qtd(usuario?.comissaoPct ?? 0)}%
        </p>
        <form action={sair}>
          <button type="submit" className="sair">
            Sair
          </button>
        </form>
      </div>
    </>
  );
}
