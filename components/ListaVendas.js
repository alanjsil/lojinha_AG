"use client";

import FormEditarVenda from "./FormEditarVenda";
import ListaExpansivel from "./ListaExpansivel";

export default function ListaVendas({ itens, excluir }) {
  return <ListaExpansivel itens={itens} excluir={excluir} vazio="Nenhuma venda nos últimos 7 dias." renderEditar={(item, fechar) => <FormEditarVenda venda={item.dados} aoFechar={fechar} />} />;
}
