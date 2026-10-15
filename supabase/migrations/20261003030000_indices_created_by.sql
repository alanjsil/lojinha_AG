-- ============================================================
-- 007: índices nas FKs created_by (compras, despesas, contagens_estoque)
-- Esses índices já existiam no banco do Supabase (criados direto no painel,
-- a pedido do advisor de performance "unindexed foreign keys"), mas não
-- estavam versionados. Idempotente: não muda nada onde já existem.
-- ============================================================
create index if not exists compras_created_by on compras (created_by);

create index if not exists despesas_created_by on despesas (created_by);

create index if not exists contagens_created_by on contagens_estoque (created_by);
