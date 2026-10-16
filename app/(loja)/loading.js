import { Bloco, Esqueleto } from "../../components/Skeleton";

// Vitrine: topo, busca e uma categoria com a grade de produtos em blocos cinzas
export default function Carregando() {
  return (
    <Esqueleto>
      <div className="loja-topo">
        <Bloco altura={36} largura={36} />
        <Bloco altura={20} largura="40%" />
      </div>

      <Bloco altura={52} style={{ marginBottom: 16 }} />

      <div className="card">
        <Bloco altura={24} largura="45%" />
        <ul className="loja-grade">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <Bloco altura="auto" style={{ aspectRatio: "1", marginBottom: 8 }} />
              <Bloco altura={16} largura="80%" style={{ marginBottom: 6 }} />
              <Bloco altura={20} largura="45%" style={{ marginBottom: 8 }} />
              <Bloco altura={48} />
            </li>
          ))}
        </ul>
      </div>
    </Esqueleto>
  );
}
