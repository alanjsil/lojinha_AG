import { Esqueleto, SkelLista, SkelSegmentos, SkelTitulo } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <Esqueleto>
      <SkelTitulo largura="35%" />
      <SkelSegmentos />
      <div className="card">
        <SkelLista n={8} />
      </div>
    </Esqueleto>
  );
}
