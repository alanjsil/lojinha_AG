-- 012: totais acumulados desde o início até uma data (só gerente). Roda com o usuário logado (RLS vale).
-- Saldo de resultado = lucro bruto − comissões − despesas − pró-labore + aportes − saques
-- (comissão paga não entra de novo: a comissão já abate o lucro líquido).
create or replace function resumo_acumulado (ate date) returns table (
  receita numeric,
  custo numeric,
  lucro numeric,
  comissoes numeric,
  despesas numeric,
  pro_labore numeric,
  aportes numeric,
  saques numeric,
  comissoes_pagas numeric
) language sql stable security invoker
set
  search_path = public as $$
  select
    coalesce((select sum(v.quantidade * v.preco_unit) from vendas v where v.data <= ate), 0),
    coalesce((select sum(v.quantidade * v.custo_unit) from vendas v where v.data <= ate), 0),
    coalesce((select sum(v.lucro) from vendas v where v.data <= ate), 0),
    coalesce((select sum(p.comissao) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(d.valor) from despesas d where d.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pro_labore' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'aporte' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'saque' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pagamento_comissao' and l.data <= ate), 0)
  where exists (select 1 from perfis where id = (select auth.uid()) and papel = 'gerente');
$$;

revoke
execute on function resumo_acumulado (date)
from
  public,
  anon;

grant
execute on function resumo_acumulado (date) to authenticated;
