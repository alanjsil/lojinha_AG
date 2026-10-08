import Link from "next/link";
import { brl, dataBR, nomeMes, qtd, somarDias, somarMeses, ultimoDiaDoMes } from "../../lib/formato";
import { createClient, usuarioAtual } from "../../lib/supabase/server";
import { sair } from "../actions";

// meta do sócio: sobrar (antes do pró-labore) 20% do lucro bruto
const META_SOBRA = 0.2;

const PERIODOS = { dia: "Hoje", semana: "7 dias", mes: "Mês" };

// o servidor roda em UTC; "hoje" precisa ser o dia de Brasília
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// mês escolhido (AAAA-MM); inválido cai no mês atual (meses futuros valem, p/ ver parcelas a vencer)
function mesEscolhido(m, hoje) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? "") ? m : hoje.slice(0, 7);
}

// o mês corrente vai só até hoje; os demais (passados ou futuros) vão até o último dia
function intervalo(p, hoje, mes) {
  if (p === "dia") return [hoje, hoje];
  if (p === "semana") return [somarDias(hoje, -6), hoje];
  const fim = ultimoDiaDoMes(mes);
  return [`${mes}-01`, mes === hoje.slice(0, 7) ? hoje : fim];
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
    .select("data, quantidade, preco_unit, custo_unit, lucro, vendedor_id, produto_id, produtos(nome), perfis(nome)")
    .gte("data", de)
    .lte("data", ate)
    .limit(5000);
  if (!gerente) consultaVendas = consultaVendas.eq("vendedor_id", usuario?.id);

  // a comissão cai junto com cada parcela: conta no vencimento, não na data da venda
  let consultaParcelas = supabase.from("parcelas").select("comissao, vendedor_id, perfis(nome)").gte("vencimento", de).lte("vencimento", ate).limit(5000);
  if (!gerente) consultaParcelas = consultaParcelas.eq("vendedor_id", usuario?.id);

  const [{ data: vendas }, { data: parcelas }, { data: despesas }, { data: lancamentos }, { data: acumuladoLinhas }, { data: anteriorLinhas }, { data: estoque }] = await Promise.all([
    consultaVendas,
    consultaParcelas,
    gerente ? supabase.from("despesas").select("valor").gte("data", de).lte("data", ate).limit(5000) : Promise.resolve({ data: [] }),
    gerente ? supabase.from("lancamentos").select("tipo, valor, vendedor_id, perfis!lancamentos_vendedor_id_fkey(nome)").gte("data", de).lte("data", ate).limit(5000) : Promise.resolve({ data: [] }),
    gerente ? supabase.rpc("resumo_acumulado", { ate }) : Promise.resolve({ data: [] }),
    gerente ? supabase.rpc("resumo_acumulado", { ate: somarDias(de, -1) }) : Promise.resolve({ data: [] }),
    gerente ? supabase.from("estoque_atual").select("custo, preco, saldo").limit(5000) : Promise.resolve({ data: [] }),
  ]);

  const total = { vendas: 0, custo: 0, lucro: 0, comissoes: 0 };
  const porVendedor = new Map();
  const porProduto = new Map();

  for (const v of vendas ?? []) {
    const receita = Number(v.quantidade) * Number(v.preco_unit);
    const custo = Number(v.quantidade) * Number(v.custo_unit);
    const lucro = Number(v.lucro);
    total.vendas += receita;
    total.custo += custo;
    total.lucro += lucro;

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

  const totalDespesas = (despesas ?? []).reduce((s, d) => s + Number(d.valor), 0);
  const estoqueCusto = (estoque ?? []).reduce((t, e) => t + Math.max(Number(e.saldo), 0) * Number(e.custo), 0);
  const estoqueVenda = (estoque ?? []).reduce((t, e) => t + Math.max(Number(e.saldo), 0) * Number(e.preco), 0);
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
  const liquido = total.lucro - total.comissoes - totalDespesas - caixa.pro_labore;
  // caixa (dinheiro): recebido (parcelas vencidas) + capital inicial + aportes − compras − despesas − saques − pró-labore − comissões pagas
  const caixaAte = (r) =>
    r ? Number(r.recebido) + Number(r.capital_inicial) + Number(r.aportes) - Number(r.compras) - Number(r.despesas) - Number(r.saques) - Number(r.pro_labore) - Number(r.comissoes_pagas) : 0;
  const ac = acumuladoLinhas?.[0];
  const an = anteriorLinhas?.[0];
  const acSaldo = caixaAte(ac);
  const saldoInicial = caixaAte(an);
  // movimento do período = acumulado até o fim − acumulado até o dia anterior
  const mov = (campo) => (ac ? Number(ac[campo]) - Number(an?.[campo] ?? 0) : 0);

  const entradas = mov("recebido") + mov("capital_inicial") + mov("aportes");
  const saidas = mov("compras") + mov("despesas") + mov("saques") + mov("pro_labore") + mov("comissoes_pagas");

  // indicadores: custo fixo = despesas (o pró-labore é a sobra do sócio); comissão é variável (já sai da margem)
  const custosFixos = totalDespesas;
  const margemBruta = total.vendas > 0 ? total.lucro / total.vendas : 0;
  const margemContrib = total.vendas > 0 ? (total.lucro - total.comissoes) / total.vendas : 0;
  const margemLiquida = total.vendas > 0 ? liquido / total.vendas : 0;
  const margemMinima = total.vendas > 0 ? custosFixos / total.vendas : 0;
  const pontoEquilibrio = margemContrib > 0 ? custosFixos / margemContrib : null;
  const nVendas = vendas?.length ?? 0;
  const ticketMedio = nVendas > 0 ? total.vendas / nVendas : 0;
  const margemPotencial = estoqueVenda > 0 ? (estoqueVenda - estoqueCusto) / estoqueVenda : 0;
  // meta: sobra = vendas × margem contrib − despesas = META × vendas × margem bruta
  const denomMeta = margemContrib - META_SOBRA * margemBruta;
  const metaFaturar = denomMeta > 0 ? custosFixos / denomMeta : null;
  const pctMeta = metaFaturar > 0 ? total.vendas / metaFaturar : null;
  // quanto falta faturar para um alvo (ou "atingido")
  const faltaFaturar = (alvo) => (alvo === null ? "sem vendas no período para calcular" : total.vendas >= alvo ? "atingido" : `falta ${brl(alvo - total.vendas)}`);
  const pc100 = (x) => `${qtd(x * 100)}%`;

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
  const vendedores = [...porVendedor.values()].sort((a, b) => b.comissao - a.comissao);
  const maisVendidos = [...porProduto.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5);

  return (
    <>
      <h1>Resumos</h1>
      <div className="segmentos">
        {Object.entries(PERIODOS).map(([k, r]) => (
          <Link key={k} href={k === "mes" ? `/resumos?p=mes&m=${mes}` : `/resumos?p=${k}`} className={p === k ? "ativo" : ""}>
            {r}
          </Link>
        ))}
      </div>

      {p === "mes" && (
        <div className="mes-nav">
          <Link href={`/resumos?p=mes&m=${somarMeses(mes, -1)}`} aria-label="Mês anterior">
            ‹
          </Link>
          <span>{nomeMes(mes)}</span>
          <Link href={`/resumos?p=mes&m=${somarMeses(mes, 1)}`} aria-label="Próximo mês">
            ›
          </Link>
        </div>
      )}

      <div className="card">
        <h2>01 · Visão geral</h2>
        {gerente && ac && (
          <>
            <div className="rotulo">Saldo em {dataBR(ate, true)}</div>
            <div className={`numero ${acSaldo < 0 ? "negativo" : "positivo"}`} style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 12 }}>
              {brl(acSaldo)}
            </div>
          </>
        )}
        <div className="kpis">
          <div className="kpi">
            <div className="rotulo">Vendas</div>
            <div className="numero">{brl(total.vendas)}</div>
          </div>
          {gerente && (
            <div className="kpi">
              <div className="rotulo">Lucro líquido</div>
              <div className={`numero ${liquido < 0 ? "negativo" : "positivo"}`}>{brl(liquido)}</div>
            </div>
          )}
          <div className="kpi">
            <div className="rotulo">{gerente ? "Margem líquida" : "Margem bruta"}</div>
            <div className="numero">{pc100(gerente ? margemLiquida : margemBruta)}</div>
          </div>
          <div className="kpi">
            <div className="rotulo">{gerente ? "Comissões" : "Sua comissão"}</div>
            <div className="numero">{brl(total.comissoes)}</div>
          </div>
          <div className="kpi">
            <div className="rotulo">Ticket médio</div>
            <div className="numero">{brl(ticketMedio)}</div>
          </div>
        </div>
      </div>

      {gerente && (
        <div className="card">
          <h2>02 · Resultado</h2>
          <ul className="lista">
            <li>
              <span className="titulo">Receita</span>
              <span className="valor">{brl(total.vendas)}</span>
            </li>
            <li>
              <span className="titulo">− CMV (custo das mercadorias)</span>
              <span className="valor">{brl(total.custo)}</span>
            </li>
            <li>
              <span className="titulo">= Lucro bruto</span>
              <span className="valor positivo">{brl(total.lucro)}</span>
            </li>
            <li>
              <span className="titulo">− Comissões</span>
              <span className="valor">{brl(total.comissoes)}</span>
            </li>
            <li>
              <span className="titulo">− Despesas</span>
              <span className="valor">{brl(totalDespesas)}</span>
            </li>
            <li>
              <span className="titulo">− Pró-labore</span>
              <span className="valor">{brl(caixa.pro_labore)}</span>
            </li>
            <li>
              <span className="titulo">= Lucro líquido</span>
              <span className={`valor ${liquido < 0 ? "negativo" : "positivo"}`}>{brl(liquido)}</span>
            </li>
          </ul>
          <p className="info">As comissões contam no vencimento de cada parcela. As compras não entram aqui: o custo da mercadoria já está no CMV de cada venda.</p>
        </div>
      )}

      {gerente && ac && (
        <div className="card">
          <h2>03 · Caixa</h2>
          <ul className="lista">
            <li>
              <span className="titulo">Saldo inicial</span>
              <span className={`valor ${saldoInicial < 0 ? "negativo" : ""}`}>{brl(saldoInicial)}</span>
            </li>
            <li>
              <details className="detalhe">
                <summary>
                  <span className="titulo">+ Entradas</span>
                  <span className="valor positivo">{brl(entradas)}</span>
                </summary>
                <ul className="lista">
                  {[
                    ["Vendas recebidas", mov("recebido")],
                    ["Capital inicial", mov("capital_inicial")],
                    ["Aportes", mov("aportes")],
                  ].map(([nome, v]) => (
                    <li key={nome}>
                      <span className="sub">{nome}</span>
                      <span className="valor">{brl(v)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
            <li>
              <details className="detalhe">
                <summary>
                  <span className="titulo">− Saídas</span>
                  <span className="valor">{brl(saidas)}</span>
                </summary>
                <ul className="lista">
                  {[
                    ["Compras", mov("compras")],
                    ["Despesas", mov("despesas")],
                    ["Saques", mov("saques")],
                    ["Pró-labore", mov("pro_labore")],
                    ["Comissões pagas", mov("comissoes_pagas")],
                  ].map(([nome, v]) => (
                    <li key={nome}>
                      <span className="sub">{nome}</span>
                      <span className="valor">{brl(v)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
            <li>
              <span className="titulo">= Saldo final</span>
              <span className={`valor ${acSaldo < 0 ? "negativo" : "positivo"}`}>{brl(acSaldo)}</span>
            </li>
          </ul>
          <p className="info">
            Dinheiro em caixa: vendas à vista entram na data e cartão em cada parcela, no vencimento. O saldo de um período passa para o seguinte. Não é o saldo da conta bancária.
          </p>
        </div>
      )}

      {gerente && (
        <div className="card">
          <h2>04 · Estoque</h2>
          <ul className="lista">
            <li>
              <span className="titulo">Estoque a custo</span>
              <span className="valor">{brl(estoqueCusto)}</span>
            </li>
            <li>
              <span className="titulo">Estoque a venda</span>
              <span className="valor">{brl(estoqueVenda)}</span>
            </li>
            <li>
              <span className="titulo">Margem potencial</span>
              <span className="valor positivo">
                {brl(estoqueVenda - estoqueCusto)} · {pc100(margemPotencial)}
              </span>
            </li>
          </ul>
          <p className="info">Posição de hoje, não do período escolhido.</p>
        </div>
      )}

      <div className="card">
        <h2>05 · Performance</h2>
        {vendedores.length === 0 ? (
          <p className="vazio">Sem vendas no período.</p>
        ) : (
          <ul className="lista">
            {vendedores.map((v) => (
              <li key={v.nome}>
                <div>
                  <div className="titulo">{v.nome}</div>
                  <div className="sub">
                    {v.n} {v.n === 1 ? "venda" : "vendas"} · vendas {brl(v.vendas)}
                  </div>
                  {gerente && (
                    <div className="sub">
                      paga {brl(v.pago ?? 0)} · a pagar {brl(v.comissao - (v.pago ?? 0))}
                    </div>
                  )}
                </div>
                <div className="valor">{brl(v.comissao)}</div>
              </li>
            ))}
          </ul>
        )}
        {maisVendidos.length > 0 && (
          <>
            <h2 style={{ marginTop: 16 }}>Mais vendidos</h2>
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
          </>
        )}
      </div>

      {gerente && (
        <div className="card">
          <h2>06 · Indicadores</h2>
          <ul className="lista">
            <li>
              <div>
                <div className="titulo">Ponto de equilíbrio</div>
                <div className="sub">faturar para pagar CMV, comissões e despesas, sem sobrar</div>
                <div className="sub">
                  já faturou {brl(total.vendas)} · {faltaFaturar(pontoEquilibrio)}
                </div>
              </div>
              <span className="valor">{pontoEquilibrio === null ? "–" : brl(pontoEquilibrio)}</span>
            </li>
            <li>
              <div>
                <div className="titulo">Margem mínima</div>
                <div className="sub">margem bruta atual {pc100(margemBruta)}</div>
              </div>
              <span className={`valor ${margemBruta >= margemMinima ? "positivo" : "negativo"}`}>{pc100(margemMinima)}</span>
            </li>
            <li>
              <span className="titulo">% da meta atingida</span>
              <span className={`valor ${pctMeta !== null && pctMeta >= 1 ? "positivo" : ""}`}>{pctMeta === null ? "–" : pc100(pctMeta)}</span>
            </li>
          </ul>
        </div>
      )}

      <div className="card">
        <h2>07 · Demonstrativo</h2>
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
                  <td className={l.valor < 0 ? "negativo" : ""}>{brl(l.valor)}</td>
                  <td>{pct(l.valor, total.vendas)}</td>
                  <td>{l.semPctLucro ? "–" : pct(l.valor, total.lucro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <p className="info" style={{ marginTop: 0 }}>
          Conectado como <strong>{usuario?.nome}</strong> · comissão {qtd(usuario?.comissaoPct ?? 0)}%
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
