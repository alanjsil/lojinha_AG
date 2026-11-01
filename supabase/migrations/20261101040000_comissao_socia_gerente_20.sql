-- 041: venda do gerente passa a render 20% (era 35%) para a sócia. Venda de vendedor continua 35 − (X − 10);
-- venda da própria sócia continua a comissão do perfil dela. Vale só para vendas novas (o % é fotografado no INSERT).
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
    new.socia_pct := 20;
  end if;
  return new;
end $$;
