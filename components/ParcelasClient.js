"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { desfazerRecebimento, receberParcelas } from "../app/actions";
import { brl, dataBR, nomeMes, qtd, somarMeses } from "../lib/formato";
import { dataRecebimentoValida, mensagemCobranca } from "../lib/parcelas";
import { formatarTelefone, linkWhatsApp } from "../lib/pedido";
import useEnvio, { Mensagem } from "./useEnvio";

function Kpi({ rotulo, valor, children }) {
  return (
    <div className="kpi">
      <div className="rotulo">{rotulo}</div>
      <div className="numero">{valor}</div>
      {children}
    </div>
  );
}

const FILTROS = [
  { chave: "atrasadas", rotulo: "Em atraso", vale: (c) => c.nAtrasadas > 0 },
  { chave: "mes", rotulo: "Vencem no mês", vale: (c, mes) => c.parcelas.some((p) => p.vencimento.slice(0, 7) === mes) },
  { chave: "recebidas", rotulo: "Recebidas no mês", vale: (c, mes) => c.parcelas.some((p) => p.recebido_em?.slice(0, 7) === mes) },
  { chave: "abertas", rotulo: "Todas em aberto", vale: (c) => c.aberto > 0 },
];

const VAZIO = {
  atrasadas: "Nenhuma parcela em atraso.",
  mes: "Nenhuma parcela vence neste mês.",
  recebidas: "Nenhuma parcela foi recebida neste mês.",
  abertas: "Nenhuma parcela em aberto.",
};

const dias = (n) => `${n} ${n === 1 ? "dia" : "dias"}`;
const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function situacaoTexto(p) {
  const s = p.situacao;
  if (s.tipo === "recebida") {
    const extra = s.antecipada ? ` · antecipada ${dias(s.dias)}` : s.emAtraso ? ` · ${dias(s.dias)} depois do vencimento` : "";
    return `Recebida em ${dataBR(p.recebido_em, true)}${extra}`;
  }
  if (s.tipo === "atrasada") return `Atrasada há ${dias(s.dias)}`;
  return s.dias === 0 ? "Vence hoje" : `Vence em ${dias(s.dias)}`;
}

const itensParaEnviar = (itens) => itens.map((i) => ({ vendaId: i.venda_id, numero: i.numero }));

// Parcelas da compra. O estado vive aqui (a linha é recriada ao abrir outra compra), então a escolha não vaza entre compras.
function Detalhe({ c, hoje }) {
  const { podeBaixar } = c;
  const { salvando, msg, enviar } = useEnvio();
  const [sel, setSel] = useState(() => new Set());
  const [data, setData] = useState(hoje);
  const [aviso, setAviso] = useState(null);

  const abertas = c.parcelas.filter((p) => !p.recebida);
  const atrasadas = abertas.filter((p) => p.situacao.tipo === "atrasada");
  const escolhidas = abertas.filter((p) => sel.has(p.numero));
  const soma = (ps) => ps.reduce((s, p) => s + p.valor, 0);
  const alternar = (n) =>
    setSel((atual) => {
      const novo = new Set(atual);
      if (novo.has(n)) novo.delete(n);
      else novo.add(n);
      return novo;
    });

  function baixar(ps) {
    const erro = dataRecebimentoValida(data, c.data, hoje);
    setAviso(erro);
    if (erro) return;
    // só os itens que ainda não têm baixa: a data de quem já foi recebido não muda
    const itens = itensParaEnviar(ps.flatMap((p) => p.itens.filter((i) => !i.recebido_em)));
    enviar(receberParcelas, { itens, data }, { aoConcluir: () => setSel(new Set()), textoOk: ps.length === 1 ? "Baixa registrada!" : `${ps.length} parcelas baixadas!` });
  }

  function desfazer(p) {
    if (!window.confirm(`Desfazer a baixa da parcela ${p.numero}/${c.n}? Ela sai do caixa e da comissão do mês em que foi recebida.`)) return;
    setAviso(null);
    enviar(desfazerRecebimento, { itens: itensParaEnviar(p.itens.filter((i) => i.recebido_em)) }, { textoOk: "Baixa desfeita." });
  }

  const cobranca =
    c.telefone && atrasadas.length > 0
      ? linkWhatsApp(c.telefone, mensagemCobranca(c.cliente, atrasadas.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: p.valor })), c.n))
      : null;

  return (
    <>
      <table className="tabela-painel tabela-parcelas">
        <thead>
          <tr>
            {podeBaixar && <th aria-label="Escolher" />}
            <th>Parcela</th>
            <th>Vencimento</th>
            <th>Valor</th>
            <th>Situação</th>
            {podeBaixar && <th aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {c.parcelas.map((p) => (
            <tr key={p.numero}>
              {podeBaixar && (
                <td>
                  {!p.recebida && (
                    <label className="parcelas-marca">
                      <input type="checkbox" checked={sel.has(p.numero)} onChange={() => alternar(p.numero)} aria-label={`Escolher a parcela ${p.numero}`} />
                      <span className="so-celular">Escolher</span>
                    </label>
                  )}
                </td>
              )}
              <td data-rotulo="Parcela">
                {p.numero}/{c.n}
              </td>
              <td data-rotulo="Vencimento">{dataBR(p.vencimento, true)}</td>
              <td data-rotulo="Valor">{brl(p.valor)}</td>
              <td data-rotulo="Situação" className={p.situacao.tipo === "atrasada" ? "negativo" : p.situacao.tipo === "recebida" ? "positivo" : undefined}>{situacaoTexto(p)}</td>
              {podeBaixar && (
                <td>
                  {p.podeDesfazer && (
                    <button type="button" className="botao-secundario pequeno" disabled={salvando} onClick={() => desfazer(p)}>
                      Desfazer
                    </button>
                  )}
                  {p.recebida && !p.podeDesfazer && <span className="sub">Só o gerente pode desfazer</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {(podeBaixar && abertas.length > 0) || cobranca ? (
        <div className="parcelas-acoes">
          {podeBaixar && abertas.length > 0 && (
            <>
              <div>
                <label htmlFor={`rec-${c.chave}`}>Recebido em</label>
                <input id={`rec-${c.chave}`} type="date" value={data} max={hoje} min={c.data} onChange={(e) => setData(e.target.value)} />
              </div>
              <button type="button" disabled={salvando || escolhidas.length === 0} onClick={() => baixar(escolhidas)}>
                {escolhidas.length > 0 ? `Dar baixa em ${escolhidas.length} (${brl(soma(escolhidas))})` : "Dar baixa nas escolhidas"}
              </button>
              <button type="button" className="botao-claro" disabled={salvando} onClick={() => baixar(abertas)}>
                Quitar tudo ({brl(soma(abertas))})
              </button>
            </>
          )}
          {cobranca && (
            <a href={cobranca} target="_blank" rel="noopener noreferrer">
              Cobrar no WhatsApp
            </a>
          )}
        </div>
      ) : null}
      {aviso && <p className="msg-erro">{aviso}</p>}
      <Mensagem msg={msg} />
      {podeBaixar && abertas.length > 0 && (
        <p className="info">Data antes do vencimento = antecipação: o dinheiro e a comissão entram no mês da data de recebimento, não no do vencimento.</p>
      )}
    </>
  );
}

const SUBTITULO = {
  gerente: "Dê baixa quando o dinheiro do cartão entrar",
  socia: "Dê baixa nas suas vendas; as dos outros são só consulta",
  vendedor: "Suas vendas no cartão: dê baixa quando o cliente pagar",
};

export default function ParcelasClient({ periodo, resumo, compras, papel }) {
  const { mes, hoje } = periodo;
  // o vendedor só recebe as próprias vendas: o nome dele em cada linha não diz nada
  const mostraVendedor = papel !== "vendedor";
  const [filtro, setFiltro] = useState(resumo.nAtrasadas > 0 ? "atrasadas" : "mes");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(null);

  const contagem = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.chave, compras.filter((c) => f.vale(c, mes)).length])), [compras, mes]);
  const linhas = useMemo(() => {
    const vale = FILTROS.find((f) => f.chave === filtro).vale;
    const termo = semAcento(busca).trim();
    const digitos = busca.replace(/\D/g, "");
    return compras.filter((c) => {
      if (!vale(c, mes)) return false;
      if (!termo) return true;
      return [c.cliente, ...(mostraVendedor ? [c.vendedor] : []), ...c.produtos].some((t) => semAcento(t).includes(termo)) || (digitos.length >= 3 && (c.telefone ?? "").includes(digitos));
    });
  }, [compras, filtro, busca, mes, mostraVendedor]);
  const totais = linhas.reduce((t, c) => ({ total: t.total + c.total, aberto: t.aberto + c.aberto }), { total: 0, aberto: 0 });

  return (
    <div className="painel">
      <div className="titulo-linha">
        <h1>Parcelas</h1>
        <span className="sub">{SUBTITULO[papel]}</span>
      </div>

      <div className="painel-filtros parcelas-filtros">
        <div className="segmentos">
          {FILTROS.map((f) => (
            <button key={f.chave} type="button" className={filtro === f.chave ? "ativo" : ""} onClick={() => setFiltro(f.chave)}>
              {f.rotulo} ({contagem[f.chave]})
            </button>
          ))}
        </div>
        <div className="mes-nav">
          <Link href={`/parcelas?m=${somarMeses(mes, -1)}`} aria-label="Mês anterior">
            ‹
          </Link>
          <span>{nomeMes(mes)}</span>
          <Link href={`/parcelas?m=${somarMeses(mes, 1)}`} aria-label="Próximo mês">
            ›
          </Link>
        </div>
      </div>

      <div className="kpis painel-kpis">
        <Kpi rotulo="Em atraso" valor={<span className={resumo.atrasado > 0 ? "negativo" : undefined}>{brl(resumo.atrasado)}</span>}>
          <span className="variacao">
            {qtd(resumo.nAtrasadas)} {resumo.nAtrasadas === 1 ? "parcela" : "parcelas"} · {qtd(resumo.comprasAtrasadas)} {resumo.comprasAtrasadas === 1 ? "compra" : "compras"}
          </span>
        </Kpi>
        <Kpi rotulo={`Falta receber em ${nomeMes(mes).split(" ")[0].toLowerCase()}`} valor={brl(resumo.faltaMes)}>
          <span className="variacao">vence no mês e está sem baixa</span>
        </Kpi>
        <Kpi rotulo="Total a receber" valor={brl(resumo.aReceber)}>
          <span className="variacao">todas as parcelas sem baixa</span>
        </Kpi>
        <Kpi rotulo={`Recebido em ${nomeMes(mes).split(" ")[0].toLowerCase()}`} valor={brl(resumo.recebidoMes)}>
          <span className="variacao">antecipado {brl(resumo.antecipadoMes)}</span>
        </Kpi>
      </div>

      <section className="card">
        <label htmlFor="busca-parcelas">Buscar</label>
        <input id="busca-parcelas" type="search" placeholder={mostraVendedor ? "Cliente, produto ou vendedor" : "Cliente, WhatsApp ou produto"} value={busca} onChange={(e) => setBusca(e.target.value)} />

        {linhas.length === 0 ? (
          <p className="vazio">{busca ? "Nada encontrado para essa busca." : VAZIO[filtro]}</p>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela-painel tabela-parcelas">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Compra</th>
                  <th>Pagas</th>
                  <th>Total</th>
                  <th>Em aberto</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => (
                  <Fragment key={c.chave}>
                    <tr className="compra-linha">
                      <td className="compra-titulo">
                        <button type="button" className="ordenar" aria-expanded={aberto === c.chave} onClick={() => setAberto(aberto === c.chave ? null : c.chave)}>
                          {aberto === c.chave ? "▾ " : "▸ "}
                          {c.cliente ?? (c.telefone ? formatarTelefone(c.telefone) : "Sem cliente")}
                        </button>
                        {c.cliente && c.telefone && <div className="sub">{formatarTelefone(c.telefone)}</div>}
                      </td>
                      <td data-rotulo="Compra">
                        <div>
                          <div>{c.produtos.join(", ")}</div>
                          <div className="sub">
                            {dataBR(c.data, true)}
                            {mostraVendedor && ` · ${c.vendedor}`}
                          </div>
                        </div>
                      </td>
                      <td data-rotulo="Pagas">
                        {c.pagas} de {c.n}
                      </td>
                      <td data-rotulo="Total">{brl(c.total)}</td>
                      <td data-rotulo="Em aberto">{brl(c.aberto)}</td>
                      <td data-rotulo="Situação" className={`compra-situacao${c.atrasado > 0 ? " negativo" : c.aberto === 0 ? " positivo" : ""}`}>
                        {c.atrasado > 0 ? `Atrasada · ${brl(c.atrasado)}` : c.aberto === 0 ? "Quitada" : `Próxima ${dataBR(c.proximo, true)}`}
                      </td>
                    </tr>
                    {aberto === c.chave && (
                      <tr className="parcelas-detalhe">
                        <td colSpan={6}>
                          <Detalhe c={c} hoje={hoje} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    {linhas.length} {linhas.length === 1 ? "compra" : "compras"}
                  </td>
                  <td data-rotulo="Total">{brl(totais.total)}</td>
                  <td data-rotulo="Em aberto">{brl(totais.aberto)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="info">
          Venda no cartão só entra no caixa (e a comissão só cai) quando a parcela recebe baixa, na data em que o dinheiro entrou. Se o cliente antecipou, dê a baixa com a data do
          pagamento: o valor entra naquele mês e a parcela deixa de contar no vencimento. Parcela vencida sem baixa fica em atraso e não conta como dinheiro em caixa. Venda à vista entra
          sozinha na data da venda. Toque no nome para abrir as parcelas.
          {papel !== "gerente" && " Errou a baixa? Você pode desfazer a que você deu, até 48 horas depois; passado isso, peça ao gerente."}
        </p>
      </section>
    </div>
  );
}
