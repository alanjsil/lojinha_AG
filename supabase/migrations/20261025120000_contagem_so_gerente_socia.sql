-- 037: contagem de estoque só para gerente e sócia. A contagem ajusta o saldo sem custo (dá para "criar" estoque
-- contando a mais), então o vendedor deixa de poder lançar. Leitura continua aberta: o saldo depende dela.
drop policy if exists contagens_criar on contagens_estoque;

create policy contagens_criar on contagens_estoque for insert to authenticated
with
  check (
    eh_resumo_completo ()
  );
