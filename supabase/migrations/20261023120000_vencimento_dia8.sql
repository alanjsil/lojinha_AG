-- 035: parcelas de venda no cartão vencem todo dia 8, a partir do mês seguinte à venda
-- (venda 23/10 em 2x → 08/11 e 08/12). A 1ª data pode ser ajustada por venda (primeiro_vencimento);
-- as demais seguem de mês em mês. À vista continua vencendo na data da venda.
-- Vendas já lançadas mantêm as parcelas como estão (o trigger só roda ao gravar a venda de novo).
alter table vendas
add column if not exists primeiro_vencimento date;

create or replace function vendas_gerar_parcelas () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  n int := new.parcelas;
  total numeric := round(new.quantidade * new.preco_unit, 2);
  v_parc numeric := round(total / n, 2);
  c_parc numeric := round(new.comissao / n, 2);
  s_parc numeric := round(new.comissao_socia / n, 2);
  base date;
  k int;
begin
  delete from public.parcelas where venda_id = new.id;
  if new.apagado_em is not null then
    return null;
  end if;
  base := case
    when new.pagamento <> 'cartao' then new.data
    else coalesce(new.primeiro_vencimento, (date_trunc('month', new.data) + interval '1 month' + interval '7 days')::date)
  end;
  for k in 1..n loop
    insert into public.parcelas (venda_id, vendedor_id, numero, vencimento, valor, comissao, comissao_socia, socia_id)
    values (
      new.id, new.vendedor_id, k,
      (base + ((k - 1) * interval '1 month'))::date,
      case when k = n then total - v_parc * (n - 1) else v_parc end,
      case when k = n then new.comissao - c_parc * (n - 1) else c_parc end,
      case when k = n then new.comissao_socia - s_parc * (n - 1) else s_parc end,
      new.socia_id
    );
  end loop;
  return null;
end $$;

drop trigger if exists depois_de_gravar_venda on vendas;

create trigger depois_de_gravar_venda
after insert or update of data,
quantidade,
preco_unit,
pagamento,
parcelas,
primeiro_vencimento,
apagado_em on vendas for each row
execute function vendas_gerar_parcelas ();

grant
update (primeiro_vencimento) on vendas to authenticated;
