-- 022: restaurar_registro — desfaz a exclusão lógica (só o gerente).
-- security definer porque a policy restritiva da 021 esconde as linhas apagadas do app, então um UPDATE comum não as enxerga.
-- Os triggers da 021 cuidam do resto (parcelas regeradas, custo médio refeito, log "restaurou").
create or replace function restaurar_registro (p_tabela text, p_id uuid) returns void language plpgsql security definer
set
  search_path = '' as $$
declare
  v_prod uuid;
  v_qtd numeric;
  v_saldo numeric;
  v_linhas int;
begin
  if not public.eh_gerente () then
    raise exception 'Só o gerente pode restaurar.';
  end if;
  if p_tabela not in ('vendas', 'compras', 'despesas', 'lancamentos') then
    raise exception 'Tabela inválida.';
  end if;

  -- venda restaurada volta a descontar estoque: só se ainda houver saldo
  if p_tabela = 'vendas' then
    select produto_id, quantidade into v_prod, v_qtd from public.vendas where id = p_id and apagado_em is not null;
    if v_prod is not null then
      select saldo into v_saldo from public.estoque_atual where id = v_prod;
      if v_qtd > v_saldo then
        raise exception 'Estoque insuficiente para restaurar esta venda: saldo %, venda %.', v_saldo, v_qtd;
      end if;
    end if;
  end if;

  execute format('update public.%I set apagado_em = null, apagado_por = null where id = $1 and apagado_em is not null', p_tabela) using p_id;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Registro apagado não encontrado (talvez já tenha sido restaurado).';
  end if;
end $$;

revoke
execute on function restaurar_registro (text, uuid)
from
  public,
  anon;

grant
execute on function restaurar_registro (text, uuid) to authenticated;
