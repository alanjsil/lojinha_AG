-- ============================================================
-- 005: o bloqueio de custo manual não pode barrar o próprio recálculo do CMP
-- Problema: produtos_bloquear_custo_manual() desfazia qualquer mudança de custo
-- em produto com compras, inclusive a feita por recalcular_custo_medio(), então
-- o custo médio nunca era gravado. Agora o recálculo liga a flag de sessão
-- app.recalculando_cmp (só dentro da transação) e o bloqueio a respeita.
-- ============================================================
create or replace function recalcular_custo_medio (p_produto_id uuid) returns void language plpgsql security definer
set
  search_path = '' as $$
declare
  v_qtd numeric(14,4);
  v_valor numeric(14,4);
begin
  select sum(quantidade), sum(quantidade * custo_unit)
    into v_qtd, v_valor
    from public.compras where produto_id = p_produto_id;

  if v_qtd is null or v_qtd = 0 then
    return;
  end if;

  perform pg_catalog.set_config('app.recalculando_cmp', 'on', true);
  update public.produtos set custo = round(v_valor / v_qtd, 2) where id = p_produto_id;
  perform pg_catalog.set_config('app.recalculando_cmp', 'off', true);
end $$;

revoke
execute on function recalcular_custo_medio (uuid)
from
  public,
  anon,
  authenticated;

create or replace function produtos_bloquear_custo_manual () returns trigger language plpgsql
set
  search_path = '' as $$
begin
  if new.custo is distinct from old.custo
     and coalesce(pg_catalog.current_setting('app.recalculando_cmp', true), 'off') <> 'on'
     and exists (select 1 from public.compras where produto_id = new.id) then
    new.custo := old.custo;
  end if;
  return new;
end $$;

revoke
execute on function produtos_bloquear_custo_manual ()
from
  public,
  anon,
  authenticated;

-- acerta o custo dos produtos que já têm compras
do $$
declare
  v_produto_id uuid;
begin
  for v_produto_id in select distinct produto_id from public.compras loop
    perform public.recalcular_custo_medio(v_produto_id);
  end loop;
end $$;
