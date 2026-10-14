"use client";

// A página offline aparece no endereço que falhou, então recarregar tenta de novo a mesma página
export default function BotaoRecarregar() {
  return (
    <button type="button" onClick={() => location.reload()}>
      Tentar de novo
    </button>
  );
}
