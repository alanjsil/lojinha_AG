import { Esqueleto, SkelCartao, SkelLista, SkelSegmentos, SkelTitulo } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <Esqueleto>
      <SkelTitulo largura="30%" />
      <SkelSegmentos n={3} />
      <SkelCartao linhas={4} />
      <div className="card">
        <SkelLista n={4} />
      </div>
    </Esqueleto>
  );
}
