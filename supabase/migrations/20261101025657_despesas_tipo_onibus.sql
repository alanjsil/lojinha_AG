-- Novo tipo de despesa: Ônibus (transporte coletivo), ao lado de gasolina e pedágio.
-- Só amplia a lista aceita; as despesas já lançadas não mudam.
alter table public.despesas drop constraint despesas_tipo_check;
alter table public.despesas add constraint despesas_tipo_check
  check (tipo = any (array['aluguel','agua','luz','internet','gasolina','alimentacao','pedagio','onibus','outros']));
