"use client";

import { useEffect, useState } from "react";

// Exclusão em dois toques, sem janela do navegador: o 1º toque pede confirmação,
// o 2º exclui. Se ela não confirmar em 4 segundos, o botão volta ao normal.
export default function BotaoExcluir({ onConfirmar, texto = "Excluir" }) {
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (!confirmando) return;
    const t = setTimeout(() => setConfirmando(false), 4000);
    return () => clearTimeout(t);
  }, [confirmando]);

  async function tocar() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setExcluindo(true);
    await onConfirmar();
    setExcluindo(false);
    setConfirmando(false);
  }

  return (
    <button type="button" className="botao-perigo" disabled={excluindo} onClick={tocar}>
      {excluindo ? "Excluindo..." : confirmando ? "Toque de novo para confirmar" : texto}
    </button>
  );
}
