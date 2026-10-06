-- Novo tipo de despesa: gasolina
alter table despesas drop constraint if exists despesas_tipo_check;
alter table despesas add constraint despesas_tipo_check
  check (tipo in ('aluguel', 'agua', 'luz', 'internet', 'gasolina', 'outros'));
