-- 039: motivo da diferença na contagem de estoque (perda, quebra, erro de lançamento, outro), para separar perda real
-- de correção. Null = contagens antigas ou sem diferença.
alter table contagens_estoque
add column if not exists motivo text check (motivo in ('perda', 'quebra', 'erro', 'outro'));

grant insert (motivo) on contagens_estoque to authenticated;

grant
update (motivo) on contagens_estoque to authenticated;
