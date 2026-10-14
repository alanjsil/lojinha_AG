import { Esqueleto, SkelLista, SkelSegmentos, SkelTitulo } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <Esqueleto>
      <SkelTitulo largura="40%" />
      <SkelSegmentos n={4} />
      <div className="card">
        <SkelLista n={8} />
      </div>
    </Esqueleto>
  );
}
