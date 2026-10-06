-- 014: novo tipo de lançamento "capital_inicial" (o que os sócios colocaram para abrir) e coluna em resumo_acumulado.
-- Caixa = recebido + capital inicial + aportes − compras − despesas − saques − pró-labore − comissões pagas.
alter table lancamentos drop constraint if exists lancamentos_tipo_check;
alter table lancamentos add constraint lancamentos_tipo_check
  check (tipo in ('pro_labore', 'pagamento_comissao', 'saque', 'aporte', 'capital_inicial'));
-- o aporte de 3.500 já lançado era o capital inicial
update lancamentos set tipo = 'capital_inicial' where tipo = 'aporte' and valor = 3500;

drop function if exists resumo_acumulado(date);
create function resumo_acumulado(ate date)
returns table (
  receita numeric, custo numeric, lucro numeric, comissoes numeric, despesas numeric,
  pro_labore numeric, capital_inicial numeric, aportes numeric, saques numeric, comissoes_pagas numeric,
  recebido numeric, compras numeric
)
language sql stable security invoker set search_path = public as $$
  select
    coalesce((select sum(v.quantidade * v.preco_unit) from vendas v where v.data <= ate), 0),
    coalesce((select sum(v.quantidade * v.custo_unit) from vendas v where v.data <= ate), 0),
    coalesce((select sum(v.lucro) from vendas v where v.data <= ate), 0),
    coalesce((select sum(p.comissao) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(d.valor) from despesas d where d.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pro_labore' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'capital_inicial' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'aporte' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'saque' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pagamento_comissao' and l.data <= ate), 0),
    coalesce((select sum(p.valor) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(c.quantidade * c.custo_unit) from compras c where c.data <= ate), 0)
  where exists (select 1 from perfis where id = (select auth.uid()) and papel = 'gerente');
$$;
revoke execute on function resumo_acumulado(date) from public, anon;
grant execute on function resumo_acumulado(date) to authenticated;
