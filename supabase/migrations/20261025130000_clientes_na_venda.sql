-- 038: cliente opcional na venda (nome + WhatsApp), para o CRM. Venda lançada de um pedido da loja herda o cliente
-- do pedido, inclusive a conta (cliente_id). Os itens do mesmo grupo_id levam o mesmo cliente.
alter table vendas
add column if not exists cliente_nome text check (length(cliente_nome) between 2 and 80),
add column if not exists cliente_telefone text check (cliente_telefone ~ '^[0-9]{10,13}$'),
add column if not exists cliente_id uuid references perfis (id) on delete set null;

create index if not exists vendas_cliente_telefone on vendas (cliente_telefone)
where
  cliente_telefone is not null;

create index if not exists vendas_cliente on vendas (cliente_id)
where
  cliente_id is not null;

-- o app envia as colunas novas no INSERT (mig. 036: insert por coluna) e na edição
grant insert (cliente_nome, cliente_telefone, cliente_id) on vendas to authenticated;

grant
update (cliente_nome, cliente_telefone) on vendas to authenticated;
