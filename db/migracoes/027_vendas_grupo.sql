-- 027: vários itens na mesma venda. Cada item continua sendo uma linha de `vendas` (custo, comissão,
-- parcelas e estoque seguem por item); `grupo_id` liga os itens lançados juntos (null = venda de um item só).
alter table vendas
add column if not exists grupo_id uuid;

create index if not exists vendas_grupo on vendas (grupo_id)
where
  grupo_id is not null;
