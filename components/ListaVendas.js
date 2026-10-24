"use client";

import FormEditarVenda from "./FormEditarVenda";
import ListaExpansivel from "./ListaExpansivel";

// item.dados: uma entrada por item da venda (vários itens = vários formulários de edição)
export default function ListaVendas({ itens, excluir, vazio = "Nenhuma venda nos últimos 7 dias." }) {
  return (
    <ListaExpansivel
      itens={itens}
      excluir={excluir}
      vazio={vazio}
      renderEditar={(item, fechar) =>
        item.dados.map((d) => (
          <div key={d.id}>
            {item.dados.length > 1 && <p className="titulo">{d.nome}</p>}
            <FormEditarVenda venda={d} aoFechar={fechar} />
          </div>
        ))
      }
    />
  );
}
