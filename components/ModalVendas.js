"use client";

import { useState } from "react";
import ListaVendas from "./ListaVendas";

const limpar = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Botão "Listar vendas": abre todas as vendas numa janela, com busca em todos os campos do cartão
export default function ModalVendas({ itens, excluir }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const termos = limpar(busca).split(/\s+/).filter(Boolean);
  const filtrados = termos.length
    ? itens.filter((i) => {
        const texto = limpar([i.titulo, i.sub, i.valor, ...(i.detalhes ?? []), ...(i.dados ?? []).map((d) => d.nome)].join(" "));
        return termos.every((t) => texto.includes(t));
      })
    : itens;

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>
        Listar vendas
      </button>
      {aberto && (
        <div className="modal-fundo modal-vendas" role="dialog" aria-modal="true" aria-label="Todas as vendas">
          <div className="card">
            <div className="busca-vendas">
              <div className="titulo-linha">
                <h2 style={{ margin: 0 }}>Vendas ({filtrados.length})</h2>
                <button type="button" className="filtro-chip" onClick={() => setAberto(false)}>
                  Fechar
                </button>
              </div>
              <input type="search" placeholder="Buscar produto, vendedor, data, valor, obs..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar vendas" />
            </div>
            <ListaVendas itens={filtrados} excluir={excluir} vazio={termos.length ? "Nenhuma venda encontrada." : "Nenhuma venda lançada."} />
          </div>
        </div>
      )}
    </>
  );
}
