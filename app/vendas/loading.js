import { Esqueleto, SkelCartao, SkelLista, SkelTitulo } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <Esqueleto>
      <SkelTitulo />
      <SkelCartao linhas={5} />
      <div className="card">
        <SkelLista n={5} />
      </div>
    </Esqueleto>
  );
}
