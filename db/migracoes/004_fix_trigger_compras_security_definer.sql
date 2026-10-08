-- ============================================================
-- 004: compras_recalcular_custo() passa a ser security definer
-- Problema: o trigger roda como o usuário logado, que não tem permissão para
-- executar recalcular_custo_medio() (execute revogado do authenticated), então
-- lançar/excluir compra falhava. Como security definer, o trigger executa com
-- os direitos do dono da função.
-- ============================================================
create or replace function compras_recalcular_custo () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_custo_medio(old.produto_id);
    return old;
  end if;
  perform public.recalcular_custo_medio(new.produto_id);
  return new;
end $$;

revoke
execute on function compras_recalcular_custo ()
from
  public,
  anon,
  authenticated;
