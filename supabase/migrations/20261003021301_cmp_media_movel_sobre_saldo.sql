-- ============================================================
-- 006: custo médio móvel sobre o saldo em estoque
-- Antes (002/005) o custo era valor total comprado / quantidade total comprada,
-- ignorando o que já foi vendido. Agora o histórico é refeito em ordem
-- cronológica (data, created_at; compra antes de venda antes de contagem):
--   compra: novo custo = (saldo antes * custo atual + qtd * custo da compra) / (saldo antes + qtd)
--   venda e contagem só alteram a quantidade, nunca o custo
--   saldo zerado/negativo antes da compra: custo passa a ser o da compra
-- ============================================================
create or replace function recalcular_custo_medio (p_produto_id uuid) returns void language plpgsql security definer
set
  search_path = '' as $$
declare
  r record;
  v_saldo numeric := 0;
  v_custo numeric := null;
begin
  for r in
    select data, created_at, 1 as ord, 'C' as tipo, quantidade as qtd, custo_unit as custo
      from public.compras where produto_id = p_produto_id
    union all
    select data, created_at, 2, 'V', quantidade, null
      from public.vendas where produto_id = p_produto_id
    union all
    select data, created_at, 3, 'E', coalesce(diferenca, 0), null
      from public.contagens_estoque where produto_id = p_produto_id
    order by data, created_at, ord
  loop
    if r.tipo = 'C' then
      if v_custo is null or v_saldo <= 0 then
        v_custo := r.custo;
      else
        v_custo := (v_saldo * v_custo + r.qtd * r.custo) / (v_saldo + r.qtd);
      end if;
      v_saldo := v_saldo + r.qtd;
    elsif r.tipo = 'V' then
      v_saldo := v_saldo - r.qtd;
    else
      v_saldo := v_saldo + r.qtd;
    end if;
  end loop;

  -- sem nenhuma compra lançada: mantém o custo cadastrado manualmente no produto
  if v_custo is null then
    return;
  end if;

  perform pg_catalog.set_config('app.recalculando_cmp', 'on', true);
  update public.produtos set custo = round(v_custo, 2) where id = p_produto_id;
  perform pg_catalog.set_config('app.recalculando_cmp', 'off', true);
end $$;

revoke
execute on function recalcular_custo_medio (uuid)
from
  public,
  anon,
  authenticated;

-- acerta os produtos que já têm compras
do $$
declare
  v_produto_id uuid;
begin
  for v_produto_id in select distinct produto_id from public.compras loop
    perform public.recalcular_custo_medio(v_produto_id);
  end loop;
end $$;
