"use client";

import Link from "next/link";
import { brl, dataBR, nomeMes, qtd, somarMeses } from "../lib/formato";
import { PERIODOS_PAINEL } from "../lib/painel";
import { BarrasH, GraficoLinha, Rosca } from "./Graficos";

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = (x) => `${qtd(x * 100)}%`;

// variação contra o período anterior de mesmo tamanho ("–" quando não há base)
function Variacao({ atual, anterior, pontos = false }) {
  if (pontos) {
    const d = (atual - anterior) * 100;
    if (!anterior && !atual) return null;
    return <span className={`variacao ${d >= 0 ? "positivo" : "negativo"}`}>{`${d >= 0 ? "▲" : "▼"} ${qtd(Math.abs(d))} p.p.`}</span>;
  }
  if (!(anterior > 0)) return <span className="variacao">sem base anterior</span>;
  const d = (atual - anterior) / anterior;
  return <span className={`variacao ${d >= 0 ? "positivo" : "negativo"}`}>{`${d >= 0 ? "▲" : "▼"} ${qtd(Math.abs(d) * 100)}%`}</span>;
}

function Kpi({ rotulo, valor, children, destaque }) {
  return (
    <div className={`kpi${destaque ? " kpi-destaque" : ""}`}>
      <div className="rotulo">{rotulo}</div>
      <div className="numero">{valor}</div>
      {children}
    </div>
  );
}

export default function PainelClient({ periodo, indicadores: ind, anterior, caixa, pedidosNovos, serie, porCategoria, porVendedor, porProduto, porPagamento, estoque }) {
  const { p, mes, de, ate, por, hoje } = periodo;
  const rotuloX = (chave, longo) => {
    if (por === "mes") return longo ? nomeMes(chave) : MES_CURTO[Number(chave.slice(5, 7)) - 1];
    return longo ? dataBR(chave, true) : dataBR(chave);
  };
  const detalheVendas = (i) => `${i.vendas} ${i.vendas === 1 ? "venda" : "vendas"} · lucro ${brl(i.lucro)}`;

  return (
    <div className="painel">
      <div className="titulo-linha">
        <h1>Painel</h1>
        <span className="sub">
          {dataBR(de, true)} a {dataBR(ate, true)}
        </span>
      </div>

      <div className="painel-filtros">
        <div className="segmentos">
          {Object.entries(PERIODOS_PAINEL).map(([k, r]) => (
            <Link key={k} href={k === "mes" ? `/painel?p=mes&m=${mes}` : `/painel?p=${k}`} className={p === k ? "ativo" : ""}>
              {r}
            </Link>
          ))}
        </div>
        {p === "mes" && (
          <div className="mes-nav">
            <Link href={`/painel?p=mes&m=${somarMeses(mes, -1)}`} aria-label="Mês anterior">
              ‹
            </Link>
            <span>{nomeMes(mes)}</span>
            {mes < hoje.slice(0, 7) ? (
              <Link href={`/painel?p=mes&m=${somarMeses(mes, 1)}`} aria-label="Próximo mês">
                ›
              </Link>
            ) : (
              <span className="desabilitado" aria-hidden="true">
                ›
              </span>
            )}
          </div>
        )}
      </div>

      <div className="kpis painel-kpis">
        <Kpi rotulo="Vendas" valor={brl(ind.receita)}>
          <Variacao atual={ind.receita} anterior={anterior.receita} />
        </Kpi>
        <Kpi rotulo="Lucro bruto" valor={brl(ind.lucro)}>
          <Variacao atual={ind.lucro} anterior={anterior.lucro} />
        </Kpi>
        <Kpi rotulo="Margem bruta" valor={pct(ind.margemBruta)}>
          <Variacao atual={ind.margemBruta} anterior={anterior.margemBruta} pontos />
        </Kpi>
        <Kpi rotulo="Lucro líquido" valor={<span className={ind.liquido < 0 ? "negativo" : undefined}>{brl(ind.liquido)}</span>}>
          <span className="variacao">margem {pct(ind.margemLiquida)}</span>
        </Kpi>
        <Kpi rotulo="Nº de vendas" valor={qtd(ind.nVendas)}>
          <Variacao atual={ind.nVendas} anterior={anterior.nVendas} />
        </Kpi>
        <Kpi rotulo="Ticket médio" valor={brl(ind.ticketMedio)}>
          <Variacao atual={ind.ticketMedio} anterior={anterior.ticketMedio} />
        </Kpi>
        <Kpi rotulo="Comissões" valor={brl(ind.comissoes)}>
          <span className="variacao">despesas {brl(ind.despesas)}</span>
        </Kpi>
        <Kpi rotulo={`Caixa em ${dataBR(ate)}`} valor={caixa === null ? "–" : <span className={caixa < 0 ? "negativo" : undefined}>{brl(caixa)}</span>}>
          <Link href="/vendas" className="variacao">
            {pedidosNovos > 0 ? `${pedidosNovos} ${pedidosNovos === 1 ? "pedido novo" : "pedidos novos"} na loja ›` : "nenhum pedido novo"}
          </Link>
        </Kpi>
      </div>

      <div className="painel-grade">
        <section className="card painel-largo">
          <h2>Vendas e lucro por {por === "mes" ? "mês" : "dia"}</h2>
          <GraficoLinha
            pontos={serie}
            rotuloX={rotuloX}
            series={[
              { campo: "receita", nome: "Vendas" },
              { campo: "lucro", nome: "Lucro" },
            ]}
          />
        </section>

        <section className="card">
          <h2>Por categoria</h2>
          <BarrasH itens={porCategoria} detalhe={detalheVendas} />
        </section>

        <section className="card">
          <h2>Por vendedor</h2>
          <BarrasH itens={porVendedor} detalhe={detalheVendas} />
        </section>

        <section className="card">
          <h2>10 produtos que mais venderam</h2>
          <BarrasH itens={porProduto} detalhe={(i) => `${qtd(i.quantidade)} un. · lucro ${brl(i.lucro)}`} />
        </section>

        <section className="card">
          <h2>Forma de pagamento</h2>
          <Rosca itens={porPagamento} />
        </section>

        <section className="card painel-largo">
          <h2>Estoque</h2>
          <div className="kpis">
            <Kpi rotulo="Parado a custo" valor={brl(estoque.valorCusto)} />
            <Kpi rotulo="Valor de venda" valor={brl(estoque.valorVenda)} />
          </div>
          <div className="painel-colunas">
            <div>
              <h3>Esgotados ({estoque.esgotados.length})</h3>
              {estoque.esgotados.length === 0 ? (
                <p className="vazio">Nenhum produto ativo esgotado.</p>
              ) : (
                <ul className="lista">
                  {estoque.esgotados.map((e) => (
                    <li key={e.id}>
                      <span className="titulo">{e.nome}</span>
                      <span className="valor negativo">
                        {qtd(e.saldo)} {e.unidade}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Sem venda no período ({estoque.nParados})</h3>
              {estoque.parados.length === 0 ? (
                <p className="vazio">Todo produto com saldo vendeu no período.</p>
              ) : (
                <ul className="lista">
                  {estoque.parados.map((e) => (
                    <li key={e.id}>
                      <div>
                        <div className="titulo">{e.nome}</div>
                        <div className="sub">
                          {qtd(e.saldo)} {e.unidade} em estoque
                        </div>
                      </div>
                      <span className="valor">{brl(e.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="painel-atalhos">
        <Link href="/vendas" className="link-cartao">
          Vendas e pedidos
        </Link>
        <Link href="/estoque" className="link-cartao">
          Estoque
        </Link>
        <Link href="/saidas" className="link-cartao">
          Saídas
        </Link>
        <Link href={`/resumos?p=mes&m=${mes}`} className="link-cartao">
          Resumos (DRE e caixa)
        </Link>
      </div>
    </div>
  );
}
