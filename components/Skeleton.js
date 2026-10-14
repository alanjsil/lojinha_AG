// Tela de carregamento em "esqueleto": blocos cinzas no formato da página enquanto os dados chegam.
// Peças pequenas para cada loading.js montar o desenho da sua tela.

export function Bloco({ altura = 20, largura = "100%", raio, style }) {
  return <span className="skel" style={{ height: altura, width: largura, borderRadius: raio, ...style }} />;
}

export function SkelTitulo({ largura = "45%" }) {
  return <Bloco altura={30} largura={largura} style={{ margin: "8px 0 16px" }} />;
}

export function SkelSegmentos({ n = 2 }) {
  return (
    <div className="skel-segmentos">
      {Array.from({ length: n }, (_, i) => (
        <Bloco key={i} altura={44} />
      ))}
    </div>
  );
}

export function SkelCartao({ linhas = 3 }) {
  return (
    <div className="card">
      {Array.from({ length: linhas }, (_, i) => (
        <Bloco key={i} altura={i === 0 ? 22 : 52} largura={i === 0 ? "40%" : "100%"} style={{ marginBottom: 12 }} />
      ))}
    </div>
  );
}

export function SkelKpis({ n = 4, className = "" }) {
  return (
    <div className={`kpis ${className}`}>
      {Array.from({ length: n }, (_, i) => (
        <div className="kpi" key={i}>
          <Bloco altura={14} largura="60%" style={{ marginBottom: 8 }} />
          <Bloco altura={24} largura="80%" />
        </div>
      ))}
    </div>
  );
}

export function SkelLista({ n = 6 }) {
  return (
    <ul className="lista" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <div style={{ flex: 1 }}>
            <Bloco altura={18} largura="55%" style={{ marginBottom: 6 }} />
            <Bloco altura={14} largura="35%" />
          </div>
          <Bloco altura={18} largura={70} />
        </li>
      ))}
    </ul>
  );
}

// Envoltório com o aviso para leitor de tela
export function Esqueleto({ children }) {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando">
      {children}
    </div>
  );
}
