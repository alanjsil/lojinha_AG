import Link from "next/link";
import { brl, dataBR, nomeMes, qtd, somarDias, somarMeses, ultimoDiaDoMes } from "../../lib/formato";
import { todas } from "../../lib/paginar";
import { resumoEstoque, somarPor } from "../../lib/painel";
import { despesasPorTipo, indicadoresResumo, META_SOBRA, perdasPorMotivo } from "../../lib/resumo";
import { createClient, usuarioAtual } from "../../lib/supabase/server";
import { sair } from "../actions";

// o servidor roda em UTC; "hoje" precisa ser o dia de Brasília
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// mês escolhido (AAAA-MM); inválido cai no mês atual (meses futuros valem, p/ ver parcelas a vencer)
function mesEscolhido(m, hoje) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? "") ? m : hoje.slice(0, 7);
}

// o mês corrente vai só até hoje; os demais (passados ou futuros) vão até o último dia
function intervalo(hoje, mes) {
  const fim = ultimoDiaDoMes(mes);
  return [`${mes}-01`, mes === hoje.slice(0, 7) ? hoje : fim];
}

export default async function Resumos(props) {
  const searchParams = await props.searchParams;
  const hoje = hojeBR();
  const mes = mesEscolhido(searchParams?.m, hoje);
  const [de, ate] = intervalo(hoje, mes);
  // mês futuro: o saldo conta parcelas e faturas que ainda vão vencer (projeção, não dinheiro em caixa)
  const futuro = mes > hoje.slice(0, 7);

  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  const ehGerente = Boolean(usuario?.gerente);
  // a sócia vê o Resumos completo (como o gerente); só o link do Log fica restrito ao gerente (mig. 028)
  const gerente = ehGerente || usuario?.papel === "socia";
  const socia = usuario?.papel === "socia";
  const vazio = Promise.resolve({ data: [] });

  // todas() busca página a página: o PostgREST corta cada resposta em 1000 linhas
  const consultaVendas = (a, b) => {
    const q = supabase
      .from("vendas")
      .select("id, grupo_id, data, quantidade, preco_unit, custo_unit, lucro, vendedor_id, produto_id, produtos(nome, categoria_id), perfis!vendas_vendedor_id_fkey(nome)")
      .gte("data", de)
      .lte("data", ate)
      .order("id")
      .range(a, b);
    return gerente ? q : q.eq("vendedor_id", usuario?.id);
  };

  // a comissão cai junto com cada parcela: conta no vencimento, não na data da venda
  const consultaParcelas = (a, b) => {
    const q = supabase.from("parcelas").select("id, comissao, comissao_socia, socia_id, vendedor_id, perfis(nome)").gte("vencimento", de).lte("vencimento", ate).order("id").range(a, b);
    if (gerente) return q;
    // a sócia também vê as parcelas de outros vendedores, só para somar a comissão extra dela
    return socia ? q.or(`vendedor_id.eq.${usuario.id},socia_id.eq.${usuario.id}`) : q.eq("vendedor_id", usuario?.id);
  };

  const { data: socias } = gerente ? await supabase.from("perfis").select("id, nome").eq("papel", "socia") : { data: [] };
  const nomeSocia = new Map((socias ?? []).map((s) => [s.id, s.nome]));

  const [
    { data: vendas },
    { data: parcelas },
    { data: despesas },
    { data: lancamentos },
    { data: acumuladoLinhas },
    { data: anteriorLinhas },
    { data: estoque },
    { data: compras },
    { data: contagens },
    { data: categorias },
  ] = await Promise.all([
    todas(consultaVendas),
    todas(consultaParcelas),
    gerente ? todas((a, b) => supabase.from("despesas").select("id, tipo, valor").gte("data", de).lte("data", ate).order("id").range(a, b)) : vazio,
    gerente
      ? todas((a, b) => supabase.from("lancamentos").select("id, tipo, valor, vendedor_id, perfis!lancamentos_vendedor_id_fkey(nome)").gte("data", de).lte("data", ate).order("id").range(a, b))
      : vazio,
    gerente ? supabase.rpc("resumo_acumulado", { ate }) : vazio,
    gerente ? supabase.rpc("resumo_acumulado", { ate: somarDias(de, -1) }) : vazio,
    gerente ? todas((a, b) => supabase.from("estoque_atual").select("id, custo, preco, saldo, ativo").order("id").range(a, b)) : vazio,
    gerente ? todas((a, b) => supabase.from("compras").select("id, quantidade, custo_unit").gte("data", de).lte("data", ate).order("id").range(a, b)) : vazio,
    gerente ? todas((a, b) => supabase.from("contagens_estoque").select("id, produto_id, diferenca, motivo").gte("data", de).lte("data", ate).order("id").range(a, b)) : vazio,
    gerente ? supabase.from("categorias").select("id, nome") : vazio,
  ]);

  // dinheiro das vendas em mãos: recebido (parcelas vencidas até o fim, nunca no futuro) − repasses entregues ao gerente
  const [{ data: parcelasAcum }, { data: repassesAcum }] = await Promise.all([
    todas((a, b) => {
      const q = supabase
        .from("parcelas")
        .select("id, valor, comissao, comissao_socia, socia_id, vendedor_id, perfis(nome)")
        .lte("vencimento", ate < hoje ? ate : hoje)
        .order("id")
        .range(a, b);
      if (ehGerente) return q;
      // a sócia também precisa das parcelas dos outros, só para somar a comissão extra dela
      return socia ? q.or(`vendedor_id.eq.${usuario.id},socia_id.eq.${usuario.id}`) : q.eq("vendedor_id", usuario?.id);
    }),
    todas((a, b) => {
      const q = supabase
        .from("lancamentos")
        .select("id, tipo, valor, vendedor_id, perfis!lancamentos_vendedor_id_fkey(nome)")
        .in("tipo", ["repasse", "pagamento_comissao"])
        .lte("data", ate)
        .order("id")
        .range(a, b);
      // a sócia vê só o próprio repasse (a RLS de leitura dela abrange todos os lançamentos, mig. 028)
      return ehGerente ? q : q.eq("vendedor_id", usuario?.id);
    }),
  ]);
  const emMaos = new Map();
  const linhaMaos = (id, nome) => {
    const m = emMaos.get(id) ?? { nome: nome ?? "-", recebido: 0, entregue: 0, comissao: 0, comissaoPaga: 0 };
    emMaos.set(id, m);
    return m;
  };
  for (const pc of parcelasAcum ?? []) {
    if (ehGerente || pc.vendedor_id === usuario?.id) {
      const m = linhaMaos(pc.vendedor_id, pc.perfis?.nome);
      m.recebido += Number(pc.valor);
      m.comissao += Number(pc.comissao);
    }
    const extra = Number(pc.comissao_socia ?? 0);
    // a comissão extra da sócia só entra na linha dela (o vendedor não vê a dos outros)
    if (extra > 0 && pc.socia_id && (ehGerente || pc.socia_id === usuario?.id)) linhaMaos(pc.socia_id, nomeSocia.get(pc.socia_id) ?? usuario?.nome).comissao += extra;
  }
  for (const r of repassesAcum ?? []) {
    const m = linhaMaos(r.vendedor_id, r.perfis?.nome);
    if (r.tipo === "repasse") m.entregue += Number(r.valor);
    else m.comissaoPaga += Number(r.valor);
  }
  const maos = [...emMaos.values()].sort((a, b) => b.recebido - b.entregue - (a.recebido - a.entregue));

  const total = { vendas: 0, custo: 0, lucro: 0, comissoes: 0 };
  const porVendedor = new Map();
  const linhaVendedor = (id, nome) => {
    const v = porVendedor.get(id) ?? { id, nome: nome ?? "-", n: 0, grupos: new Set(), vendas: 0, lucro: 0, comissao: 0, pago: 0 };
    porVendedor.set(id, v);
    return v;
  };

  for (const v of vendas ?? []) {
    const receita = Number(v.quantidade) * Number(v.preco_unit);
    total.vendas += receita;
    total.custo += Number(v.quantidade) * Number(v.custo_unit);
    total.lucro += Number(v.lucro);
    const vend = linhaVendedor(v.vendedor_id, v.perfis?.nome);
    // itens do mesmo grupo_id são uma venda só
    vend.grupos.add(v.grupo_id ?? v.id);
    vend.vendas += receita;
    vend.lucro += Number(v.lucro);
  }

  for (const pc of parcelas ?? []) {
    if (gerente || pc.vendedor_id === usuario?.id) {
      const comissao = Number(pc.comissao);
      total.comissoes += comissao;
      linhaVendedor(pc.vendedor_id, pc.perfis?.nome).comissao += comissao;
    }
    // comissão extra da sócia sobre a venda de outro vendedor (só o gerente e a própria sócia enxergam)
    const extra = gerente || socia ? Number(pc.comissao_socia ?? 0) : 0;
    if (extra > 0 && pc.socia_id) {
      total.comissoes += extra;
      linhaVendedor(pc.socia_id, nomeSocia.get(pc.socia_id)).comissao += extra;
    }
  }

  const caixa = { pro_labore: 0, pagamento_comissao: 0, saque: 0, aporte: 0, capital_inicial: 0, repasse: 0 };
  for (const l of lancamentos ?? []) {
    caixa[l.tipo] += Number(l.valor);
    if (l.tipo === "pagamento_comissao") linhaVendedor(l.vendedor_id, l.perfis?.nome).pago += Number(l.valor);
  }

  const totalDespesas = (despesas ?? []).reduce((s, d) => s + Number(d.valor), 0);
  const ind = indicadoresResumo({ receita: total.vendas, lucro: total.lucro, comissoes: total.comissoes, despesas: totalDespesas, proLabore: caixa.pro_labore });
  const liquido = ind.liquido;
  const porTipo = despesasPorTipo(despesas ?? []);

  // estoque: só produtos ativos, a mesma conta do Painel
  const est = resumoEstoque(estoque ?? [], new Set());
  const custoAtual = new Map((estoque ?? []).map((e) => [e.id, Number(e.custo)]));
  const perdas = perdasPorMotivo(contagens ?? [], (id) => custoAtual.get(id));
  const totalCompras = (compras ?? []).reduce((s, c) => s + Number(c.quantidade) * Number(c.custo_unit), 0);

  // caixa (dinheiro): recebido (parcelas vencidas) + capital inicial + aportes − compras − despesas − saques − pró-labore − comissões pagas
  const caixaAte = (r) =>
    r ? Number(r.recebido) + Number(r.capital_inicial) + Number(r.aportes) - Number(r.compras) - Number(r.despesas) - Number(r.saques) - Number(r.pro_labore) - Number(r.comissoes_pagas) : 0;
  const ac = acumuladoLinhas?.[0];
  const an = anteriorLinhas?.[0];
  const acSaldo = caixaAte(ac);
  const saldoInicial = caixaAte(an);
  // gasto no cartão até o fim do período que só sai do caixa depois (já contou no lucro)
  const cartaoAPagar = Number(ac?.cartao_a_pagar ?? 0);
  // movimento do período = acumulado até o fim − acumulado até o dia anterior
  const mov = (campo) => (ac ? Number(ac[campo]) - Number(an?.[campo] ?? 0) : 0);

  const entradas = mov("recebido") + mov("capital_inicial") + mov("aportes");
  const saidas = mov("compras") + mov("despesas") + mov("saques") + mov("pro_labore") + mov("comissoes_pagas");

  const nVendas = new Set((vendas ?? []).map((v) => v.grupo_id ?? v.id)).size;
  const ticketMedio = nVendas > 0 ? total.vendas / nVendas : 0;
  const margemPotencial = est.valorVenda > 0 ? (est.valorVenda - est.valorCusto) / est.valorVenda : 0;
  // quanto falta faturar para um alvo (ou "atingido")
  const faltaFaturar = (alvo) => (alvo === null ? "sem vendas no mês para calcular" : total.vendas >= alvo ? "atingido" : `falta ${brl(alvo - total.vendas)}`);
  const pc100 = (x) => `${qtd(x * 100)}%`;
  const rotuloSaldo = futuro ? "Saldo projetado em" : "Saldo em";

  // % sobre a receita e % sobre o lucro bruto (vazio quando a base é zero)
  const pct = (v, base) => (base > 0 ? `${qtd((v / base) * 100)}%` : "–");
  const linhasDre = [
    { item: "Receita", valor: total.vendas, semPctLucro: true },
    { item: "Custo das mercadorias", valor: total.custo, semPctLucro: true },
    { item: "Lucro bruto", valor: total.lucro, forte: true },
    { item: "Comissões", valor: total.comissoes },
    { item: "Despesas", valor: totalDespesas },
    { item: "Pró-labore", valor: caixa.pro_labore },
    { item: "Lucro líquido", valor: liquido, forte: true },
  ];
  const vendedores = [...porVendedor.values()].map((v) => ({ ...v, n: v.grupos.size })).sort((a, b) => b.vendas - a.vendas || b.comissao - a.comissao);
  // linha de quem não vendeu no mês, mas recebe comissão (parcela de venda antiga ou a extra da sócia)
  const semVenda = (v) => (nomeSocia.has(v.id) ? "comissão sobre as vendas da equipe" : "sem venda no mês · comissão de parcelas anteriores");

  // gerente: o que dá lucro (com margem); vendedor: o que mais sai (quantidade), sem lucro
  const produtos = somarPor(
    vendas ?? [],
    (v) => v.produto_id,
    (v) => v.produtos?.nome ?? "-",
  );
  const maisVendidos = (gerente ? [...produtos].sort((a, b) => b.lucro - a.lucro) : [...produtos].sort((a, b) => b.quantidade - a.quantidade)).slice(0, 5);
  const nomeCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nome]));
  const porCategoria = gerente
    ? somarPor(
        vendas ?? [],
        (v) => v.produtos?.categoria_id ?? "outros",
        (v) => nomeCategoria.get(v.produtos?.categoria_id) ?? "Outros",
      ).sort((a, b) => b.lucro - a.lucro)
    : [];

  return (
    <>
      <h1>Resumos</h1>

      <div className="mes-nav">
        <Link href={`/resumos?m=${somarMeses(mes, -1)}`} aria-label="Mês anterior">
          ‹
        </Link>
        <span>{nomeMes(mes)}</span>
        <Link href={`/resumos?m=${somarMeses(mes, 1)}`} aria-label="Próximo mês">
          ›
        </Link>
      </div>

      <div className="card">
        <h2>01 · Visão geral</h2>
        {gerente && ac && (
          <>
            <div className="rotulo">
              {rotuloSaldo} {dataBR(ate, true)}
            </div>
            <div className={`numero ${acSaldo < 0 ? "negativo" : "positivo"}`} style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 12 }}>
              {brl(acSaldo)}
            </div>
            {futuro && (
              <p className="sub" style={{ marginTop: -8, marginBottom: 12 }}>
                Projeção: conta como recebidas as parcelas que ainda vão vencer e como pagas as faturas do cartão.
              </p>
            )}
            {cartaoAPagar > 0 && (
              <p className="sub" style={{ marginTop: -8, marginBottom: 12 }}>
                Cartão a pagar: {brl(cartaoAPagar)} (sobra {brl(acSaldo - cartaoAPagar)} depois das faturas)
              </p>
            )}
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
          {gerente && (
            <div className="kpi">
              <div className="rotulo">Margem líquida</div>
              <div className="numero">{pc100(ind.margemLiquida)}</div>
            </div>
          )}
          <div className="kpi">
            <div className="rotulo">{gerente ? "Comissões" : "Sua comissão"}</div>
            <div className="numero">{brl(total.comissoes)}</div>
          </div>
          <div className="kpi">
            <div className="rotulo">Ticket médio</div>
            <div className="numero">{brl(ticketMedio)}</div>
          </div>
        </div>
        <p className="info">
          Vendas, lucro e ticket contam na data da venda; comissões, no vencimento de cada parcela. Num mês com muita venda parcelada, a comissão do mês fica menor que a das
          vendas do mês (e a margem líquida, maior): ela aparece nos meses seguintes.
        </p>
      </div>

      {maos.length > 0 && (
        <div className="card">
          <h2>{ehGerente ? "Dinheiro com os vendedores" : "Seu repasse"}</h2>
          <ul className="lista">
            {maos.map((m) => {
              const pendente = m.recebido - m.entregue;
              // limpo = pendente sem a comissão do vendedor que ainda não foi paga (já está com ele)
              const aReceber = m.comissao - m.comissaoPaga;
              const limpo = pendente - aReceber;
              return (
                <li key={m.nome}>
                  <div>
                    <div className="titulo">{ehGerente ? m.nome : "Pendente de entrega"}</div>
                    <div className="sub">
                      recebido {brl(m.recebido)} · entregue {brl(m.entregue)}
                    </div>
                    <div className="sub">comissão a receber {brl(aReceber)}</div>
                  </div>
                  <div className={`valor ${pendente > 0 ? "negativo" : ""}`}>
                    {brl(pendente)}
                    <div className="sub">Limpo {brl(limpo)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="info">
            Pendente = recebido das vendas (parcelas vencidas) − repasses entregues, até {dataBR(ate, true)}. Limpo = pendente − a comissão que ainda é {ehGerente ? "do vendedor" : "sua"}
            : é o que {ehGerente ? "ele ainda deve entregar" : "você ainda deve entregar"} se a comissão for acertada com esse dinheiro.
          </p>
        </div>
      )}

      {ehGerente && (
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
              {porTipo.length > 0 ? (
                <details className="detalhe">
                  <summary>
                    <span className="titulo">− Despesas</span>
                    <span className="valor">{brl(totalDespesas)}</span>
                  </summary>
                  <ul className="lista">
                    {porTipo.map((t) => (
                      <li key={t.tipo}>
                        <span className="sub">{t.nome}</span>
                        <span className="valor">
                          {brl(t.valor)} <span className="sub">{pct(t.valor, totalDespesas)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <>
                  <span className="titulo">− Despesas</span>
                  <span className="valor">{brl(0)}</span>
                </>
              )}
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
          <p className="info">
            As comissões contam no vencimento de cada parcela; as despesas, na data do gasto (mesmo no cartão). As compras não entram aqui: o custo da mercadoria já está no CMV de
            cada venda. Toque em Despesas para ver por tipo.
          </p>
        </div>
      )}

      {gerente && ac && (
        <div className="card">
          <h2>03 · Caixa{futuro ? " (projeção)" : ""}</h2>
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
              <span className="titulo">= {futuro ? "Saldo projetado" : "Saldo final"}</span>
              <span className={`valor ${acSaldo < 0 ? "negativo" : "positivo"}`}>{brl(acSaldo)}</span>
            </li>
            {cartaoAPagar > 0 && (
              <li>
                <span className="sub">Cartão a pagar (faturas futuras)</span>
                <span className="valor">{brl(cartaoAPagar)}</span>
              </li>
            )}
          </ul>
          <p className="info">
            Dinheiro em caixa: vendas à vista entram na data e cartão em cada parcela, no vencimento. Despesas e compras no cartão saem no vencimento da fatura (no lucro, contam na
            data do gasto). O saldo de um mês passa para o seguinte. Supõe que toda parcela vencida caiu: não é o saldo da conta bancária.
            {futuro ? " Neste mês futuro, tudo o que ainda vai vencer já está contado." : ""}
          </p>
        </div>
      )}

      {gerente && (
        <div className="card">
          <h2>04 · Estoque</h2>
          <ul className="lista">
            <li>
              <span className="titulo">Estoque a custo</span>
              <span className="valor">{brl(est.valorCusto)}</span>
            </li>
            <li>
              <span className="titulo">Estoque a venda</span>
              <span className="valor">{brl(est.valorVenda)}</span>
            </li>
            <li>
              <span className="titulo">Margem potencial</span>
              <span className="valor positivo">
                {brl(est.valorVenda - est.valorCusto)} · {pc100(margemPotencial)}
              </span>
            </li>
            <li>
              <div>
                <div className="titulo">Compras do mês</div>
                <div className="sub">CMV do mês {brl(total.custo)}</div>
              </div>
              <span className={`valor ${totalCompras > total.custo ? "negativo" : ""}`}>{brl(totalCompras)}</span>
            </li>
            <li>
              {perdas.itens.length > 0 ? (
                <details className="detalhe">
                  <summary>
                    <span className="titulo">Perdas na contagem (aprox.)</span>
                    <span className="valor negativo">{brl(perdas.total)}</span>
                  </summary>
                  <ul className="lista">
                    {perdas.itens.map((p) => (
                      <li key={p.motivo}>
                        <span className="sub">
                          {p.nome} · {qtd(p.quantidade)} un.
                        </span>
                        <span className="valor">{brl(p.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <>
                  <span className="titulo">Perdas na contagem</span>
                  <span className="valor">{brl(0)}</span>
                </>
              )}
            </li>
          </ul>
          <p className="info">
            Estoque: posição de hoje, só produtos ativos (o mesmo número do Painel). Compras do mês acima do CMV = entrou mais mercadoria do que saiu vendida (o estoque cresceu).
            Perdas: faltas achadas nas contagens do mês, ao custo atual do produto.
          </p>
        </div>
      )}

      <div className="card">
        <h2>05 · Performance</h2>
        {vendedores.length === 0 ? (
          <p className="vazio">Sem vendas no mês.</p>
        ) : (
          <ul className="lista">
            {vendedores.map((v) => (
              <li key={v.id ?? v.nome}>
                <div>
                  <div className="titulo">{v.nome}</div>
                  <div className="sub">
                    {v.n === 0 ? semVenda(v) : `${v.n} ${v.n === 1 ? "venda" : "vendas"} · vendas ${brl(v.vendas)}${ehGerente ? ` · lucro ${brl(v.lucro)}` : ""}`}
                  </div>
                  {gerente && (
                    <div className="sub">
                      comissão paga {brl(v.pago)} · a pagar {brl(v.comissao - v.pago)}
                    </div>
                  )}
                </div>
                <div className="valor">
                  {brl(v.comissao)}
                  <div className="sub">comissão</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {maisVendidos.length > 0 && (
          <details className="detalhe" style={{ marginTop: 16 }}>
            <summary>
              <span className="titulo">{gerente ? "Produtos que mais deram lucro" : "Mais vendidos"}</span>
              <span className="sub">
                {maisVendidos.length} {maisVendidos.length === 1 ? "produto" : "produtos"}
              </span>
            </summary>
            <ul className="lista">
              {maisVendidos.map((m) => (
                <li key={m.chave}>
                  <div>
                    <div className="titulo">{m.nome}</div>
                    <div className="sub">
                      {qtd(m.quantidade)} vendidos{gerente ? ` · margem ${pct(m.lucro, m.receita)}` : ""}
                    </div>
                  </div>
                  <div className="valor">{gerente ? brl(m.lucro) : qtd(m.quantidade)}</div>
                </li>
              ))}
            </ul>
          </details>
        )}
        {porCategoria.length > 0 && (
          <details className="detalhe" style={{ marginTop: 8 }}>
            <summary>
              <span className="titulo">Lucro por categoria</span>
              <span className="sub">
                {porCategoria.length} {porCategoria.length === 1 ? "categoria" : "categorias"}
              </span>
            </summary>
            <ul className="lista">
              {porCategoria.map((c) => (
                <li key={c.chave}>
                  <div>
                    <div className="titulo">{c.nome}</div>
                    <div className="sub">
                      vendas {brl(c.receita)} · margem {pct(c.lucro, c.receita)}
                    </div>
                  </div>
                  <div className="valor">{brl(c.lucro)}</div>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="info">Ordem: quem mais vendeu no mês. A comissão é a que vence no mês (parcelas), por isso não bate com as vendas do mês.</p>
      </div>

      {gerente && (
        <div className="card">
          <h2>06 · Indicadores</h2>
          <ul className="lista">
            <li>
              <div>
                <div className="titulo">Ponto de equilíbrio</div>
                <div className="sub">faturar para pagar mercadoria, comissões e despesas, sem sobrar</div>
                <div className="sub">
                  já faturou {brl(total.vendas)} · {faltaFaturar(ind.pontoEquilibrio)}
                </div>
              </div>
              <span className="valor">{ind.pontoEquilibrio === null ? "–" : brl(ind.pontoEquilibrio)}</span>
            </li>
            <li>
              <div>
                <div className="titulo">Margem mínima</div>
                <div className="sub">despesas ÷ vendas: quanto de cada R$ 1 vendido as despesas comem</div>
                <div className="sub">
                  margem de contribuição atual {pc100(ind.margemContrib)} ({ind.minimaOk ? "cobre" : "não cobre"})
                </div>
              </div>
              <span className={`valor ${ind.minimaOk ? "positivo" : "negativo"}`}>{pc100(ind.margemMinima)}</span>
            </li>
            <li>
              <div>
                <div className="titulo">Meta do mês</div>
                <div className="sub">
                  sobrar {qtd(META_SOBRA * 100)}% do lucro bruto antes do pró-labore (hoje sobra {brl(ind.sobra)} de {brl(ind.sobraMeta)})
                </div>
                <div className="sub">
                  faturar {ind.metaFaturar === null ? "–" : brl(ind.metaFaturar)} · {faltaFaturar(ind.metaFaturar)}
                </div>
              </div>
              <span className={`valor ${ind.pctMeta !== null && ind.pctMeta >= 1 ? "positivo" : ""}`}>{ind.pctMeta === null ? "–" : pc100(ind.pctMeta)}</span>
            </li>
          </ul>
          <p className="info">
            Margem de contribuição = (lucro bruto − comissões) ÷ vendas: o que cada R$ 1 vendido deixa para pagar as despesas. Ponto de equilíbrio e meta supõem que a margem do resto
            do mês fica igual à de até agora.
          </p>
        </div>
      )}

      {ehGerente && (
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
          <p className="info">% lucro = sobre o lucro bruto.</p>
        </div>
      )}

      {ehGerente && (
        <Link href="/log" className="link-cartao">
          <span className="icone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <span className="texto">
            <strong>Histórico de alterações</strong>
            <span>Quem lançou, editou ou apagou — e restaurar</span>
          </span>
          <span className="seta" aria-hidden="true">
            ›
          </span>
        </Link>
      )}

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
