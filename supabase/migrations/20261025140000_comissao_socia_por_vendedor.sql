-- 040: comissão do vendedor de 10% (padrão) a 40%. Nas vendas dos outros a sócia ganha 35%, e o que o vendedor
-- ganha acima de 10% sai da parte dela (12% → 33%, 15% → 30%, 40% → 5%). Venda do gerente: sócia 35%.
-- Nas vendas da própria sócia continua a comissão do perfil dela. Vale só para vendas novas (o % é fotografado).
alter table perfis
alter column comissao_pct
set default 10;

alter table perfis
drop constraint if exists perfis_comissao_vendedor;

alter table perfis
add constraint perfis_comissao_vendedor check (
  papel <> 'vendedor'
  or comissao_pct between 10 and 40
);

create or replace function vendas_preencher () returns trigger language plpgsql
set
  search_path = '' as $$
declare
  v_papel text;
begin
  new.vendedor_id := coalesce((select auth.uid()), new.vendedor_id);
  new.custo_unit := (select custo from public.produtos where id = new.produto_id);
  select comissao_pct, papel into new.comissao_pct, v_papel from public.perfis where id = new.vendedor_id;
  -- a sócia ganha também sobre as vendas dos outros (as dela já pagam a comissão normal)
  select id into new.socia_id
    from public.perfis
    where papel = 'socia' and id <> new.vendedor_id
    order by created_at
    limit 1;
  if new.socia_id is null then
    new.socia_pct := 0;
  elsif v_papel = 'vendedor' then
    new.socia_pct := greatest(35 - greatest(new.comissao_pct - 10, 0), 0);
  else
    new.socia_pct := 35;
  end if;
  return new;
end $$;
