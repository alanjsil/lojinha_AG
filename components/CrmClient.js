"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { brl, dataBR, nomeMes, qtd, somarMeses } from "../lib/formato";
import { formatarTelefone, STATUS_PEDIDO } from "../lib/pedido";
import { PERIODOS_PAINEL } from "../lib/painel";
import { BarrasH, GraficoLinha } from "./Graficos";

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = (x) => (x === null ? "–" : `${qtd(x * 100)}%`);

function Kpi({ rotulo, valor, children }) {
  return (
    <div className="kpi">
      <div className="rotulo">{rotulo}</div>
      <div className="numero">{valor}</div>
      {children}
    </div>
  );
}

const COLUNAS = [
  { campo: "nome", rotulo: "Cliente" },
  { campo: "noPeriodo", rotulo: "No período" },
  { campo: "total", rotulo: "Total" },
  { campo: "nCompras", rotulo: "Compras" },
  { campo: "ticket", rotulo: "Ticket" },
  { campo: "ultima", rotulo: "Última compra" },
];

function Contato({ c }) {
  if (!c.whatsapp) return <span className="sub">sem WhatsApp</span>;
  return (
    <a href={c.whatsapp} target="_blank" rel="noopener noreferrer">
      {formatarTelefone(c.telefone)}
    </a>
  );
}

function Sumidos({ titulo, lista, n }) {
  return (
    <div>
      <h3>
        {titulo} ({n})
      </h3>
      {lista.length === 0 ? (
        <p className="vazio">Ninguém.</p>
      ) : (
        <ul className="lista">
          {lista.map((c) => (
            <li key={c.chave}>
              <div>
                <div className="titulo">{c.nome}</div>
                <div className="sub">
                  última {dataBR(c.ultima, true)} · {c.nCompras} {c.nCompras === 1 ? "compra" : "compras"} · <Contato c={c} />
                </div>
              </div>
              <span className="valor">{brl(c.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CrmClient({ periodo, clientes, recorrencia, semCliente, sumidos, funil, seriePedidos }) {
  const { p, mes, de, ate, por, hoje } = periodo;
  const [ordem, setOrdem] = useState({ campo: "noPeriodo", asc: false });
  const [aberto, setAberto] = useState(null);
  const [soPeriodo, setSoPeriodo] = useState(true);

  const linhas = useMemo(() => {
    const sinal = ordem.asc ? 1 : -1;
    const base = soPeriodo ? clientes.filter((c) => c.comprasPeriodo > 0) : clientes;
    return [...base].sort((a, b) => {
      const x = a[ordem.campo];
      const y = b[ordem.campo];
      return sinal * (typeof x === "string" ? x.localeCompare(y, "pt-BR") : x - y);
    });
  }, [clientes, ordem, soPeriodo]);
  const ordenarPor = (campo) => setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : campo === "nome" }));
  const rotuloX = (chave, longo) => {
    if (por === "mes") return longo ? nomeMes(chave) : MES_CURTO[Number(chave.slice(5, 7)) - 1];
    return longo ? dataBR(chave, true) : dataBR(chave);
  };

  const top = linhas.slice(0, 10).map((c) => ({ chave: c.chave, nome: c.nome, receita: soPeriodo ? c.noPeriodo : c.total, n: c.nCompras }));
  const etapas = ["novo", "confirmado", "pronto", "entregue", "cancelado"].map((s) => ({ chave: s, nome: STATUS_PEDIDO[s], receita: funil.por[s] }));

  return (
    <div className="painel">
      <div className="titulo-linha">
        <h1>CRM</h1>
        <span className="sub">
          {dataBR(de, true)} a {dataBR(ate, true)}
        </span>
      </div>

      <div className="painel-filtros">
        <div className="segmentos">
          {Object.entries(PERIODOS_PAINEL).map(([k, r]) => (
            <Link key={k} href={k === "mes" ? `/crm?p=mes&m=${mes}` : `/crm?p=${k}`} className={p === k ? "ativo" : ""}>
              {r}
            </Link>
          ))}
        </div>
        {p === "mes" && (
          <div className="mes-nav">
            <Link href={`/crm?p=mes&m=${somarMeses(mes, -1)}`} aria-label="Mês anterior">
              ‹
            </Link>
            <span>{nomeMes(mes)}</span>
            {mes < hoje.slice(0, 7) ? (
              <Link href={`/crm?p=mes&m=${somarMeses(mes, 1)}`} aria-label="Próximo mês">
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
        <Kpi rotulo="Clientes que compraram" valor={qtd(recorrencia.ativos)}>
          <span className="variacao">
            {qtd(recorrencia.novos)} {recorrencia.novos === 1 ? "novo" : "novos"} · {qtd(recorrencia.recorrentes)} {recorrencia.recorrentes === 1 ? "voltou" : "voltaram"}
          </span>
        </Kpi>
        <Kpi rotulo="Clientes no cadastro" valor={qtd(clientes.length)}>
          <span className="variacao">quem já foi informado numa venda</span>
        </Kpi>
        <Kpi rotulo="Pedidos da loja entregues" valor={pct(funil.conversao)}>
          <span className="variacao">
            {qtd(funil.por.entregue)} de {qtd(funil.total)} pedidos · {pct(funil.cancelamento)} cancelados
          </span>
        </Kpi>
        <Kpi rotulo="Vendas sem cliente" valor={pct(semCliente.total ? semCliente.n / semCliente.total : null)}>
          <span className="variacao">
            {qtd(semCliente.n)} de {qtd(semCliente.total)} vendas no período
          </span>
        </Kpi>
      </div>

      <div className="painel-grade">
        <section className="card painel-largo">
          <div className="titulo-linha">
            <h2>Clientes</h2>
            <div className="segmentos" style={{ marginBottom: 0 }}>
              <button type="button" className={soPeriodo ? "ativo" : ""} onClick={() => setSoPeriodo(true)}>
                Compraram no período
              </button>
              <button type="button" className={soPeriodo ? "" : "ativo"} onClick={() => setSoPeriodo(false)}>
                Todos
              </button>
            </div>
          </div>
          {linhas.length === 0 ? (
            <p className="vazio">{clientes.length === 0 ? "Nenhuma venda com cliente ainda. Preencha o WhatsApp ou o nome do cliente ao lançar a venda." : "Nenhum cliente comprou no período."}</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela-painel">
                <thead>
                  <tr>
                    {COLUNAS.map((c) => (
                      <th key={c.campo} aria-sort={ordem.campo === c.campo ? (ordem.asc ? "ascending" : "descending") : "none"}>
                        <button type="button" className="ordenar" onClick={() => ordenarPor(c.campo)}>
                          {c.rotulo}
                          <span aria-hidden="true">{ordem.campo === c.campo ? (ordem.asc ? " ▲" : " ▼") : ""}</span>
                        </button>
                      </th>
                    ))}
                    <th>WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((c) => (
                    <Fragment key={c.chave}>
                      <tr>
                        <td>
                          <button type="button" className="ordenar" aria-expanded={aberto === c.chave} onClick={() => setAberto(aberto === c.chave ? null : c.chave)}>
                            {aberto === c.chave ? "▾ " : "▸ "}
                            {c.nome}
                          </button>
                          {c.conta && <span className="sub"> · tem conta</span>}
                        </td>
                        <td>{brl(c.noPeriodo)}</td>
                        <td>{brl(c.total)}</td>
                        <td>{qtd(c.nCompras)}</td>
                        <td>{brl(c.ticket)}</td>
                        <td>{dataBR(c.ultima, true)}</td>
                        <td>
                          <Contato c={c} />
                        </td>
                      </tr>
                      {aberto === c.chave && (
                        <tr>
                          <td colSpan={COLUNAS.length + 1}>
                            <div className="sub" style={{ marginBottom: 4 }}>
                              Cliente desde {dataBR(c.primeira, true)} · o que mais compra:
                            </div>
                            <ul className="lista">
                              {c.produtos.map((pr) => (
                                <li key={pr.nome}>
                                  <span className="titulo">{pr.nome}</span>
                                  <span className="valor">
                                    {qtd(pr.quantidade)} · {brl(pr.receita)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="info">
            Cliente = nome e/ou WhatsApp informados na venda (pedido da loja entregue já traz o cliente). O mesmo WhatsApp é o mesmo cliente; sem WhatsApp, junta pelo nome. Toque no
            nome para ver o que ele compra.
          </p>
        </section>

        <section className="card">
          <h2>Top 10 {soPeriodo ? "no período" : "de sempre"}</h2>
          <BarrasH itens={top} detalhe={(i) => `${i.n} ${i.n === 1 ? "compra" : "compras"} no total`} vazio="Sem clientes no período." />
        </section>

        <section className="card">
          <h2>Pedidos da loja</h2>
          <BarrasH itens={etapas} formatar={qtd} vazio="Sem pedidos no período." />
          <p className="info">
            {funil.total === 0
              ? "Nenhum pedido feito na vitrine no período."
              : `${qtd(funil.abertos)} ainda em aberto. Entregues: ${brl(funil.valorEntregue)}${funil.horasAteEntregar === null ? "" : `, em média ${qtd(Math.round(funil.horasAteEntregar))} h do pedido à entrega`}.`}
          </p>
        </section>

        <section className="card painel-largo">
          <h2>Pedidos por {por === "mes" ? "mês" : "dia"}</h2>
          <GraficoLinha
            pontos={seriePedidos}
            rotuloX={rotuloX}
            formatar={qtd}
            series={[
              { campo: "recebidos", nome: "Recebidos" },
              { campo: "entregues", nome: "Entregues" },
            ]}
          />
        </section>

        <section className="card painel-largo">
          <h2>Clientes sumidos</h2>
          <div className="painel-colunas" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Sumidos titulo="30 a 59 dias" lista={sumidos.d30} n={sumidos.n30} />
            <Sumidos titulo="60 a 89 dias" lista={sumidos.d60} n={sumidos.n60} />
            <Sumidos titulo="90 dias ou mais" lista={sumidos.d90} n={sumidos.n90} />
          </div>
          <p className="info">Dias desde a última compra, contados até hoje. Os que mais gastaram primeiro (até 15 por faixa). O WhatsApp abre a conversa.</p>
        </section>
      </div>

      <div className="painel-atalhos">
        <Link href="/painel" className="link-cartao">
          Painel
        </Link>
        <Link href="/vendas" className="link-cartao">
          Vendas e pedidos
        </Link>
        <Link href={`/resumos?m=${mes}`} className="link-cartao">
          Resumos
        </Link>
      </div>
    </div>
  );
}
