-- Views para relatório no Excel (schema próprio, sem acesso para anon/authenticated).
-- Definição recuperada da produção (a migração foi aplicada direto lá).
create schema if not exists relatorios;

create or replace view relatorios.despesas as
select d.data, d.tipo, d.descricao, d.valor, c.nome as cartao, d.parcelas
from public.despesas d
left join public.cartoes c on c.id = d.cartao_id
where d.apagado_em is null;

create or replace view relatorios.estoque as
select p.nome as produto, cat.nome as categoria, p.ativo, p.custo, p.preco,
       e.entradas, s.vendido, a.ajustes,
       (e.entradas - s.vendido) + a.ajustes as saldo,
       round(greatest((e.entradas - s.vendido) + a.ajustes, 0::numeric) * p.custo, 2) as valor_estoque_custo,
       round(greatest((e.entradas - s.vendido) + a.ajustes, 0::numeric) * p.preco, 2) as valor_estoque_venda
from public.produtos p
left join public.categorias cat on cat.id = p.categoria_id
cross join lateral (select coalesce(sum(c.quantidade), 0::numeric) as entradas
                    from public.compras c
                    where c.produto_id = p.id and c.apagado_em is null) e
cross join lateral (select coalesce(sum(v.quantidade), 0::numeric) as vendido
                    from public.vendas v
                    where v.produto_id = p.id and v.apagado_em is null) s
cross join lateral (select coalesce(sum(x.diferenca), 0::numeric) as ajustes
                    from public.contagens_estoque x
                    where x.produto_id = p.id and x.apagado_em is null) a;

create or replace view relatorios.vendas as
select v.data, p.nome as produto, v.quantidade, v.custo_unit,
       v.preco_unit as preco_vendido, p.preco as preco_cadastrado,
       pf.nome as vendedor,
       case v.pagamento when 'a_vista' then 'À vista' else 'Cartão' end as pagamento,
       v.parcelas,
       round(v.quantidade * v.preco_unit, 2) as receita,
       round(v.quantidade * p.preco, 2) as valor_deveria,
       round(v.quantidade * v.preco_unit - v.quantidade * p.preco, 2) as diferenca,
       round(v.quantidade * v.custo_unit, 2) as custo_total,
       v.lucro as lucro_bruto,
       case when pf.papel = 'socia' then v.comissao_pct else v.socia_pct end as pct_socia,
       case when pf.papel = 'socia' then v.comissao else v.comissao_socia end as parte_socia,
       v.lucro
         - case when pf.papel = 'socia' then v.comissao else v.comissao_socia end
         - case when pf.papel <> 'socia' then v.comissao else 0::numeric end as lucro_alan
from public.vendas v
join public.produtos p on p.id = v.produto_id
left join public.perfis pf on pf.id = v.vendedor_id
where v.apagado_em is null;
