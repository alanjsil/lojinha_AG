"use client";

import { parcelasSaida, primeiroVencimento } from "../lib/cartao";
import { brl, dataBR } from "../lib/formato";

// Pagamento de despesa/compra: à vista ou um cartão (1–12x). Mostra quando sai do caixa:
// o lucro conta na data do gasto, o caixa no vencimento de cada parcela da fatura.
// cartoes: todos (com `ativo`); o desativado só aparece se já for o da linha
export default function CamposPagamento({ id, cartoes, cartaoId, parcelas, data, total, aoMudar }) {
  const opcoes = cartoes.filter((c) => c.ativo || c.id === cartaoId);
  if (!opcoes.length) return null;
  const cartao = opcoes.find((c) => c.id === cartaoId);
  const n = Number(parcelas) || 1;
  const lista = cartao && data ? parcelasSaida(total || 0, n, primeiroVencimento(data, cartao)) : [];

  return (
    <>
      <div className={cartaoId ? "linha-2" : undefined}>
        <div>
          <label htmlFor={`pg-${id}`}>Pagamento</label>
          <select id={`pg-${id}`} value={cartaoId} onChange={(e) => aoMudar({ cartaoId: e.target.value, parcelas: e.target.value ? parcelas : "1" })}>
            <option value="">À vista</option>
            {opcoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        {cartaoId && (
          <div>
            <label htmlFor={`pc-${id}`}>Parcelas</label>
            <select id={`pc-${id}`} value={String(parcelas)} onChange={(e) => aoMudar({ cartaoId, parcelas: e.target.value })}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}x
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {lista.length > 0 && (
        <p className="sub">
          Sai do caixa em {dataBR(lista[0].vencimento, true)}
          {n > 1 ? ` (${n}x de ${brl(lista[0].valor)}, até ${dataBR(lista[n - 1].vencimento, true)})` : ""}. No lucro conta em {dataBR(data, true)}.
        </p>
      )}
    </>
  );
}
