-- 018: papel "socia" = permissões de gerente + comissão adicional sobre as vendas de todos os outros vendedores.
-- A comissão da sócia usa o comissao_pct do perfil dela, é fotografada na venda e cai junto com as parcelas.
-- Vendas anteriores a esta migração ficam sem comissão de sócia (socia_id nulo).
alter table perfis
drop constraint if exists perfis_papel_check;

alter table perfis
add constraint perfis_papel_check check (papel in ('gerente', 'vendedor', 'socia'));

-- gerente e sócia têm o mesmo acesso administrativo
create or replace function eh_gerente () returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid ()) and papel in ('gerente', 'socia')
  );
$$;

revoke
execute on function eh_gerente ()
from
  public,
  anon;

grant
execute on function eh_gerente () to authenticated;

alter table vendas
add column if not exists socia_id uuid,
add column if not exists socia_pct numeric(5, 2) not null default 0,
add column if not exists comissao_socia numeric(12, 2) generated always as (round(greatest((preco_unit - custo_unit) * quantidade, 0) * socia_pct / 100, 2)) stored;

alter table parcelas
add column if not exists comissao_socia numeric(12, 2) not null default 0;

create or replace function vendas_preencher () returns trigger language plpgsql
set
  search_path = '' as $$
begin
  new.vendedor_id := coalesce((select auth.uid()), new.vendedor_id);
  new.custo_unit := (select custo from public.produtos where id = new.produto_id);
  new.comissao_pct := (select comissao_pct from public.perfis where id = new.vendedor_id);
  -- a sócia ganha também sobre as vendas dos outros (as dela já pagam a comissão normal)
  select id, comissao_pct into new.socia_id, new.socia_pct
    from public.perfis
    where papel = 'socia' and id <> new.vendedor_id
    order by created_at
    limit 1;
  if new.socia_id is null then
    new.socia_pct := 0;
  end if;
  return new;
end $$;

create or replace function vendas_gerar_parcelas () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  n int := new.parcelas;
  total numeric := round(new.quantidade * new.preco_unit, 2);
  v_parc numeric := round(total / n, 2);
  c_parc numeric := round(new.comissao / n, 2);
  s_parc numeric := round(new.comissao_socia / n, 2);
  k int;
begin
  delete from public.parcelas where venda_id = new.id;
  for k in 1..n loop
    insert into public.parcelas (venda_id, vendedor_id, numero, vencimento, valor, comissao, comissao_socia)
    values (
      new.id, new.vendedor_id, k,
      (new.data + ((k - 1) * interval '1 month'))::date,
      case when k = n then total - v_parc * (n - 1) else v_parc end,
      case when k = n then new.comissao - c_parc * (n - 1) else c_parc end,
      case when k = n then new.comissao_socia - s_parc * (n - 1) else s_parc end
    );
  end loop;
  return null;
end $$;

-- políticas: gerente → eh_gerente()
drop policy if exists vendas_editar on vendas;

create policy vendas_editar on vendas
for update
  to authenticated using (
    vendedor_id = (
      select
        auth.uid ()
    )
    or (
      select
        eh_gerente ()
    )
  )
with
  check (
    vendedor_id = (
      select
        auth.uid ()
    )
    or (
      select
        eh_gerente ()
    )
  );

drop policy if exists despesas_ver on despesas;

drop policy if exists despesas_criar on despesas;

drop policy if exists despesas_apagar on despesas;

drop policy if exists despesas_editar on despesas;

create policy despesas_ver on despesas for
select
  to authenticated using (
    (
      select
        eh_gerente ()
    )
  );

create policy despesas_criar on despesas for insert to authenticated
with
  check (
    (
      select
        eh_gerente ()
    )
  );

create policy despesas_apagar on despesas for delete to authenticated using (
  (
    select
      eh_gerente ()
  )
);

create policy despesas_editar on despesas
for update
  to authenticated using (
    (
      select
        eh_gerente ()
    )
  )
with
  check (
    (
      select
        eh_gerente ()
    )
  );

drop policy if exists lancamentos_ver on lancamentos;

drop policy if exists lancamentos_criar on lancamentos;

drop policy if exists lancamentos_apagar on lancamentos;

create policy lancamentos_ver on lancamentos for
select
  to authenticated using (
    (
      select
        eh_gerente ()
    )
  );

create policy lancamentos_criar on lancamentos for insert to authenticated
with
  check (
    (
      select
        eh_gerente ()
    )
  );

create policy lancamentos_apagar on lancamentos for delete to authenticated using (
  (
    select
      eh_gerente ()
  )
);

-- caixa: comissões incluem a parte da sócia
drop function if exists resumo_acumulado (date);

create function resumo_acumulado (ate date) returns table (
  receita numeric,
  custo numeric,
  lucro numeric,
  comissoes numeric,
  despesas numeric,
  pro_labore numeric,
  capital_inicial numeric,
  aportes numeric,
  saques numeric,
  comissoes_pagas numeric,
  recebido numeric,
  compras numeric
) language sql stable security invoker
set
  search_path = public as $$
  select
    coalesce((select sum(v.quantidade * v.preco_unit) from vendas v where v.data <= ate), 0),
    coalesce((select sum(v.quantidade * v.custo_unit) from vendas v where v.data <= ate), 0),
    coalesce((select sum(v.lucro) from vendas v where v.data <= ate), 0),
    coalesce((select sum(p.comissao + p.comissao_socia) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(d.valor) from despesas d where d.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pro_labore' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'capital_inicial' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'aporte' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'saque' and l.data <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pagamento_comissao' and l.data <= ate), 0),
    coalesce((select sum(p.valor) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(c.quantidade * c.custo_unit) from compras c where c.data <= ate), 0)
  where (select eh_gerente ());
$$;

revoke
execute on function resumo_acumulado (date)
from
  public,
  anon;

grant
execute on function resumo_acumulado (date) to authenticated;
