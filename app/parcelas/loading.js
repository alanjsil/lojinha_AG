import { Bloco, Esqueleto, SkelKpis, SkelLista, SkelSegmentos, SkelTitulo } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <div className="painel">
      <Esqueleto>
        <SkelTitulo largura="25%" />
        <SkelSegmentos n={4} />
        <SkelKpis n={4} className="painel-kpis" />
        <div className="card">
          <Bloco altura={44} largura="100%" style={{ marginBottom: 12 }} />
          <SkelLista n={8} />
        </div>
      </Esqueleto>
    </div>
  );
}
