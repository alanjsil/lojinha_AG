import { Bloco, Esqueleto, SkelKpis, SkelLista, SkelSegmentos, SkelTitulo } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <Esqueleto>
      <SkelTitulo largura="40%" />
      <SkelSegmentos />
      <Bloco altura={52} style={{ marginBottom: 16 }} />
      <SkelKpis />
      <div className="card">
        <SkelLista n={5} />
      </div>
    </Esqueleto>
  );
}
