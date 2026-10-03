-- ============================================================
-- 002: custo médio ponderado (CMP)
-- Problema: produtos.custo era um valor único, trocado manualmente (checkbox
-- "usar este custo no produto") a cada compra. Isso fazia o custo da compra
-- mais recente valer para TODO o saldo em estoque, mesmo a parte que ainda
-- era do lote anterior (ex.: 10 un a 4,00, vende 5, compra 5 a 3,50 — o app
-- assumia 3,50 para as 10 un, quando a média real é 3,75).
--
-- Solução: produtos.custo passa a ser sempre o custo médio ponderado de todas
-- as compras (valor total comprado / quantidade total comprada), recalculado
-- a cada compra registrada ou excluída. Deixa de ser editável à mão por
-- compra (sai o checkbox); só o custo inicial do produto, sem nenhuma compra
-- ainda, continua digitado manualmente no cadastro.
-- ============================================================

create or replace function recalcular_custo_medio(p_produto_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_qtd numeric(14,4);
  v_valor numeric(14,4);
begin
  select sum(quantidade), sum(quantidade * custo_unit)
    into v_qtd, v_valor
  from public.compras where produto_id = p_produto_id;

  -- sem nenhuma compra lançada: mantém o custo cadastrado manualmente no produto
  if v_qtd is null or v_qtd = 0 then
    return;
  end if;

  update public.produtos set custo = round(v_valor / v_qtd, 2) where id = p_produto_id;
end $$;

revoke execute on function recalcular_custo_medio(uuid) from public, anon, authenticated;

create or replace function compras_recalcular_custo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_custo_medio(old.produto_id);
    return old;
  end if;
  perform public.recalcular_custo_medio(new.produto_id);
  return new;
end $$;

drop trigger if exists depois_de_gravar_compra on compras;
create trigger depois_de_gravar_compra after insert or delete on compras
  for each row execute function compras_recalcular_custo();

revoke execute on function compras_recalcular_custo() from public, anon, authenticated;

-- Depois da 1ª compra, o custo do produto passa a ser só o CMP calculado;
-- edição manual (tela de produto) é ignorada para não quebrar a média.
create or replace function produtos_bloquear_custo_manual() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.custo is distinct from old.custo
     and exists (select 1 from public.compras where produto_id = new.id) then
    new.custo := old.custo;
  end if;
  return new;
end $$;

drop trigger if exists antes_de_atualizar_produto on produtos;
create trigger antes_de_atualizar_produto before update on produtos
  for each row execute function produtos_bloquear_custo_manual();

revoke execute on function produtos_bloquear_custo_manual() from public, anon, authenticated;

-- Acerta o custo dos produtos já cadastrados com base no histórico de compras existente
do $$
declare
  v_produto_id uuid;
begin
  for v_produto_id in select id from produtos loop
    perform recalcular_custo_medio(v_produto_id);
  end loop;
end $$;
