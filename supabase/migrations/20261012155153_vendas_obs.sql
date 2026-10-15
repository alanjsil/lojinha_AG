-- 024: observação opcional na venda (campo "Obs" do formulário de venda).
alter table vendas
add column if not exists obs text;
