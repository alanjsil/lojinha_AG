-- Novos tipos de despesa: alimentacao e pedagio
alter table despesas
drop constraint if exists despesas_tipo_check;

alter table despesas
add constraint despesas_tipo_check check (
  tipo in ('aluguel', 'agua', 'luz', 'internet', 'gasolina', 'alimentacao', 'pedagio', 'outros')
);
