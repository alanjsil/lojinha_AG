import { Esqueleto, SkelCartao, SkelLista } from "../../components/Skeleton";

export default function Carregando() {
  return (
    <Esqueleto>
      <SkelCartao linhas={2} />
      <SkelCartao linhas={2} />
      <div className="card">
        <SkelLista n={3} />
      </div>
    </Esqueleto>
  );
}
