import { brl, dataBR } from "../lib/formato";

// Barras agrupadas (vendas × lucro) por dia, em SVG puro: sem biblioteca e sem JS no navegador.
// dados: [{ data: "AAAA-MM-DD", vendas, lucro }]
export default function GraficoBarras({ dados }) {
  const L = 340;
  const A = 150;
  const base = A - 18;
  const max = Math.max(...dados.map((d) => Math.max(d.vendas, d.lucro, 0)), 1);
  const passo = L / dados.length;
  const larg = Math.max(Math.min(passo * 0.36, 16), 2);
  const altura = (v) => (Math.max(v, 0) / max) * (base - 6);
  const cadaN = dados.length > 10 ? Math.ceil(dados.length / 6) : 1;

  return (
    <>
      <svg
        className="grafico"
        viewBox={`0 0 ${L} ${A}`}
        role="img"
        aria-label="Vendas e lucro por dia"
      >
        <line x1="0" x2={L} y1={base} y2={base} stroke="#d6d6d0" />
        {dados.map((d, i) => {
          const x = i * passo + passo / 2;
          return (
            <g key={d.data}>
              <title>{`${dataBR(d.data)}: vendas ${brl(d.vendas)}, lucro ${brl(d.lucro)}`}</title>
              <rect
                x={x - larg - 1}
                y={base - altura(d.vendas)}
                width={larg}
                height={altura(d.vendas)}
                rx="2"
                fill="#1e3a8a"
              />
              <rect
                x={x + 1}
                y={base - altura(d.lucro)}
                width={larg}
                height={altura(d.lucro)}
                rx="2"
                fill="#15803d"
              />
              {i % cadaN === 0 && (
                <text
                  x={x}
                  y={A - 4}
                  fontSize="10"
                  textAnchor="middle"
                  fill="#666"
                >
                  {dataBR(d.data)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legenda">
        <span>
          <i style={{ background: "#1e3a8a" }} />
          Vendas
        </span>
        <span>
          <i style={{ background: "#15803d" }} />
          Lucro
        </span>
      </div>
    </>
  );
}
