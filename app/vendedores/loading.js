import { Bloco, Esqueleto, SkelLista, SkelTitulo } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <Esqueleto>
      <SkelTitulo largura="40%" />
      <Bloco altura={52} style={{ marginBottom: 16 }} />
      <div className="card">
        <SkelLista n={4} />
      </div>
    </Esqueleto>
  );
}
