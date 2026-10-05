-- ============================================================
-- 003: índices para a view estoque_atual
-- Problema: estoque_atual soma compras, vendas e contagens_estoque por
-- produto_id sem nenhum índice nessa coluna, então cada consulta de saldo
-- (toda venda, toda tela de estoque) faz um full scan nas 3 tabelas. O app
-- fica cada vez mais lento conforme o histórico de transações cresce.
-- ============================================================

create index if not exists compras_produto on compras (produto_id);
create index if not exists vendas_produto on vendas (produto_id);
create index if not exists contagens_produto on contagens_estoque (produto_id);
