import { Bloco, Esqueleto, SkelKpis, SkelLista, SkelSegmentos, SkelTitulo } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <div className="painel">
      <Esqueleto>
        <SkelTitulo largura="25%" />
        <SkelSegmentos n={4} />
        <SkelKpis n={8} className="painel-kpis" />
        <div className="painel-grade">
          <div className="card painel-largo">
            <Bloco altura={260} />
          </div>
          <div className="card">
            <SkelLista n={4} />
          </div>
          <div className="card">
            <SkelLista n={4} />
          </div>
        </div>
      </Esqueleto>
    </div>
  );
}
