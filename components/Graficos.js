"use client";

import { useState } from "react";
import { brl, qtd } from "../lib/formato";
import { arcoRosca, caminhoLinha, escalaY, fatias, posicaoX } from "../lib/graficos";

// Cores das séries (validadas para daltonismo e contraste no fundo claro): 1 = azul, 2 = laranja
export const COR_SERIE = ["#2a78d6", "#eb6834"];

const compacto = (v) => (Math.abs(v) >= 1000 ? `${qtd(v / 1000)} mil` : qtd(v));

function Legenda({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="legenda">
      {series.map((s, i) => (
        <span key={s.nome}>
          <i style={{ background: COR_SERIE[i] }} />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

// Evolução no tempo: linhas finas, um eixo só, cruz + caixinha com os valores ao passar o mouse/dedo
export function GraficoLinha({ pontos, series, rotuloX }) {
  const [ativo, setAtivo] = useState(null);
  const L = 720;
  const A = 260;
  const area = { inicio: 56, fim: L - 12, topo: 12, base: A - 28 };
  const maximo = Math.max(0, ...pontos.flatMap((p) => series.map((s) => p[s.campo])));
  const { teto, marcas } = escalaY(maximo);
  const y = (v) => area.base - ((area.base - area.topo) * Math.max(v, 0)) / teto;
  // rótulos do eixo x: no máximo ~8, sempre o primeiro e o último
  const passoX = Math.max(1, Math.ceil(pontos.length / 8));

  function mover(e) {
    const caixa = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - caixa.left) / caixa.width) * L;
    const i = Math.round(((x - area.inicio) / (area.fim - area.inicio)) * (pontos.length - 1));
    setAtivo(Math.min(pontos.length - 1, Math.max(0, i)));
  }

  const p = ativo === null ? null : pontos[ativo];
  const xAtivo = ativo === null ? 0 : posicaoX(ativo, pontos.length, area.inicio, area.fim);

  return (
    <div className="grafico-caixa">
      <Legenda series={series} />
      <div className="grafico-area">
        <svg
          viewBox={`0 0 ${L} ${A}`}
          className="grafico"
          role="img"
          aria-label={series.map((s) => s.nome).join(" e ")}
          onPointerMove={mover}
          onPointerDown={mover}
          onPointerLeave={() => setAtivo(null)}
        >
          {marcas.map((m) => (
            <g key={m}>
              <line x1={area.inicio} x2={area.fim} y1={y(m)} y2={y(m)} className={m === 0 ? "eixo-base" : "grade"} />
              <text x={area.inicio - 8} y={y(m) + 4} textAnchor="end" className="rotulo-eixo">
                {compacto(m)}
              </text>
            </g>
          ))}
          {pontos.map((pt, i) =>
            // o penúltimo rótulo some se ficar colado no último
            (i % passoX === 0 && pontos.length - 1 - i >= passoX / 2) || i === pontos.length - 1 ? (
              <text key={pt.chave} x={posicaoX(i, pontos.length, area.inicio, area.fim)} y={A - 8} textAnchor={i === pontos.length - 1 && pontos.length > 1 ? "end" : "middle"} className="rotulo-eixo">
                {rotuloX(pt.chave)}
              </text>
            ) : null,
          )}
          {series.map((s, i) => (
            <path
              key={s.campo}
              d={caminhoLinha(
                pontos.map((pt) => pt[s.campo]),
                { ...area, teto },
              )}
              fill="none"
              stroke={COR_SERIE[i]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {p && (
            <g>
              <line x1={xAtivo} x2={xAtivo} y1={area.topo} y2={area.base} className="cruz" />
              {series.map((s, i) => (
                <circle key={s.campo} cx={xAtivo} cy={y(p[s.campo])} r="5" fill={COR_SERIE[i]} stroke="#fff" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
        {p && (
          <div className="dica" style={{ left: `${Math.min(85, Math.max(15, (xAtivo / L) * 100))}%` }} role="status">
            <strong>{rotuloX(p.chave, true)}</strong>
            {series.map((s, i) => (
              <span key={s.campo}>
                <i style={{ background: COR_SERIE[i] }} />
                {s.nome}: {brl(p[s.campo])}
              </span>
            ))}
          </div>
        )}
      </div>
      <details className="ver-tabela">
        <summary>Ver em tabela</summary>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Período</th>
                {series.map((s) => (
                  <th key={s.campo}>{s.nome}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pontos.map((pt) => (
                <tr key={pt.chave}>
                  <td>{rotuloX(pt.chave, true)}</td>
                  {series.map((s) => (
                    <td key={s.campo} className={pt[s.campo] < 0 ? "negativo" : undefined}>
                      {brl(pt[s.campo])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// Ranking em barras horizontais (HTML): nome, barra proporcional e valor ao lado; uma série só, sem legenda
export function BarrasH({ itens, campo = "receita", formatar = brl, detalhe, vazio = "Sem vendas no período." }) {
  if (!itens.length) return <p className="vazio">{vazio}</p>;
  const maximo = Math.max(...itens.map((i) => Math.max(i[campo], 0)), 0) || 1;
  return (
    <ul className="barras">
      {itens.map((i) => (
        <li key={i.chave} title={detalhe ? `${i.nome}: ${detalhe(i)}` : i.nome}>
          <div className="barras-linha">
            <span className="barras-nome">{i.nome}</span>
            <span className="barras-valor">{formatar(i[campo])}</span>
          </div>
          <div className="barras-trilho">
            <div className="barras-barra" style={{ width: `${(Math.max(i[campo], 0) / maximo) * 100}%`, background: COR_SERIE[0] }} />
          </div>
          {detalhe && <div className="barras-detalhe">{detalhe(i)}</div>}
        </li>
      ))}
    </ul>
  );
}

// Parte de um todo com 2–3 fatias (ex.: à vista × cartão), com valores e % escritos na legenda
export function Rosca({ itens, formatar = brl }) {
  const total = itens.reduce((s, i) => s + Math.max(i.valor, 0), 0);
  if (!(total > 0)) return <p className="vazio">Sem vendas no período.</p>;
  const f = fatias(itens.map((i) => i.valor));
  return (
    <div className="rosca">
      <svg viewBox="0 0 120 120" role="img" aria-label={itens.map((i, k) => `${i.nome} ${Math.round(f[k].fracao * 100)}%`).join(", ")}>
        {itens.map((i, k) =>
          f[k].fracao > 0 ? (
            <path key={i.nome} d={arcoRosca(60, 60, 56, 34, f[k].inicio, f[k].fim)} fill={COR_SERIE[k]} stroke="#fff" strokeWidth="2">
              <title>{`${i.nome}: ${formatar(i.valor)} (${Math.round(f[k].fracao * 100)}%)`}</title>
            </path>
          ) : null,
        )}
      </svg>
      <ul className="rosca-legenda">
        {itens.map((i, k) => (
          <li key={i.nome}>
            <i style={{ background: COR_SERIE[k] }} />
            <span>{i.nome}</span>
            <strong>{formatar(i.valor)}</strong>
            <span className="sub">{Math.round(f[k].fracao * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
