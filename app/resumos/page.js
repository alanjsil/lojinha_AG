import Link from "next/link";
import GraficoBarras from "../../components/GraficoBarras";
import { brl, nomeMes, qtd, somarDias, somarMeses, ultimoDiaDoMes } from "../../lib/formato";
import { createClient, usuarioAtual } from "../../lib/supabase/server";
import { sair } from "../actions";

const PERIODOS = { dia: "Hoje", semana: "7 dias", mes: "Mês" };

// o servidor roda em UTC; "hoje" precisa ser o dia de Brasília
const hojeBR = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// mês escolhido (AAAA-MM); inválido ou futuro cai no mês atual
function mesEscolhido(m, hoje) {
  const atual = hoje.slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? "") && m <= atual ? m : atual;
}

// o mês corrente vai só até hoje; meses passados vão até o último dia
function intervalo(p, hoje, mes) {
  if (p === "dia") return [hoje, hoje];
  if (p === "semana") return [somarDias(hoje, -6), hoje];
  const fim = ultimoDiaDoMes(mes);
  return [`${mes}-01`, fim < hoje ? fim : hoje];
}

function diasEntre(de, ate) {
  const dias = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

export default async function Resumos({ searchParams }) {
  const p = PERIODOS[searchParams?.p] ? searchParams.p : "semana";
  const hoje = hojeBR();
  const mes = mesEscolhido(searchParams?.m, hoje);
  const [de, ate] = intervalo(p, hoje, mes);

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

  const [
    { data: vendas },
    { data: parcelas },
    { data: despesas },
    { data: lancamentos },
  ] =
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
      gerente
        ? supabase
            .from("lancamentos")
            .select("tipo, valor, vendedor_id, perfis!lancamentos_vendedor_id_fkey(nome)")
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
  const caixa = { pro_labore: 0, pagamento_comissao: 0, saque: 0, aporte: 0 };
  for (const l of lancamentos ?? []) {
    caixa[l.tipo] += Number(l.valor);
    if (l.tipo === "pagamento_comissao") {
      const vend = porVendedor.get(l.vendedor_id) ?? {
        nome: l.perfis?.nome ?? "-",
        n: 0,
        vendas: 0,
        lucro: 0,
        comissao: 0,
      };
      vend.pago = (vend.pago ?? 0) + Number(l.valor);
      porVendedor.set(l.vendedor_id, vend);
    }
  }
  const liquido =
    total.lucro - total.comissoes - totalDespesas - caixa.pro_labore;
  const saldoCaixa =
    caixa.aporte - caixa.saque - caixa.pro_labore - caixa.pagamento_comissao;

  // % sobre a receita e % sobre o lucro bruto (vazio quando a base é zero)
  const pct = (v, base) => (base > 0 ? `${qtd((v / base) * 100)}%` : "–");
  const linhasDre = [
    { item: "Receita", valor: total.vendas, semPctLucro: true },
    { item: "Custo das mercadorias", valor: total.custo, semPctLucro: true },
    { item: "Lucro bruto", valor: total.lucro, forte: true },
    { item: gerente ? "Comissões" : "Sua comissão", valor: total.comissoes },
    ...(gerente
      ? [
          { item: "Despesas", valor: totalDespesas },
          { item: "Pró-labore", valor: caixa.pro_labore },
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
            href={k === "mes" ? `/resumos?p=mes&m=${mes}` : `/resumos?p=${k}`}
            className={p === k ? "ativo" : ""}
          >
            {r}
          </Link>
        ))}
      </div>

      {p === "mes" && (
        <div className="mes-nav">
          <Link
            href={`/resumos?p=mes&m=${somarMeses(mes, -1)}`}
            aria-label="Mês anterior"
          >
            ‹
          </Link>
          <span>{nomeMes(mes)}</span>
          {mes < hoje.slice(0, 7) ? (
            <Link
              href={`/resumos?p=mes&m=${somarMeses(mes, 1)}`}
              aria-label="Próximo mês"
            >
              ›
            </Link>
          ) : (
            <span className="desabilitado" aria-hidden="true">
              ›
            </span>
          )}
        </div>
      )}

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
                  <td>{l.semPctLucro ? "–" : pct(l.valor, total.lucro)}</td>
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
            Lucro líquido = lucro bruto − comissões − despesas − pró-labore. As comissões
            contam no vencimento de cada parcela (venda no cartão parcelada paga
            a comissão aos poucos). A mercadoria já entra no lucro pelo custo de
            cada venda; por isso as compras não são subtraídas de novo.
          </p>
        </div>
      )}

      {gerente && (
        <div className="card">
          <h2>Movimentação de caixa</h2>
          <ul className="lista">
            <li>
              <span className="titulo">Aportes</span>
              <span className="valor positivo">{brl(caixa.aporte)}</span>
            </li>
            <li>
              <span className="titulo">Saques</span>
              <span className="valor">{brl(caixa.saque)}</span>
            </li>
            <li>
              <span className="titulo">Pró-labore</span>
              <span className="valor">{brl(caixa.pro_labore)}</span>
            </li>
            <li>
              <span className="titulo">Comissões pagas</span>
              <span className="valor">{brl(caixa.pagamento_comissao)}</span>
            </li>
            <li>
              <span className="titulo">Saldo dos lançamentos</span>
              <span
                className={`valor ${saldoCaixa < 0 ? "negativo" : "positivo"}`}
              >
                {brl(saldoCaixa)}
              </span>
            </li>
          </ul>
          <p className="info">
            Só os lançamentos de Saídas. Saques, aportes e comissões pagas não
            mudam o lucro; o pró-labore já entra no lucro líquido.
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
                    <div className="sub">
                      paga {brl(v.pago ?? 0)} · a pagar{" "}
                      {brl(v.comissao - (v.pago ?? 0))}
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
