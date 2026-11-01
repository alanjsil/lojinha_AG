-- Corrige regressão da 20261020002928_saidas_cartao: ela recriou o gatilho "depois_de_gravar_compra"
-- (mesmo nome) para gerar as parcelas, e com isso o gatilho que refazia o custo médio
-- (compras_recalcular_custo, da 20261009000000) deixou de existir. Desde então, compra nova não atualizava produtos.custo.
-- Aqui os dois ficam separados: parcelas continua em depois_de_gravar_compra; o custo médio volta num gatilho próprio.
-- Não mexe em dados: só liga o gatilho. As compras anteriores a 20/10 já estão com o custo correto.
drop trigger if exists compras_custo_medio on compras;

create trigger compras_custo_medio
after insert or delete or update of apagado_em,
data,
quantidade,
custo_unit on compras for each row
execute function compras_recalcular_custo ();
