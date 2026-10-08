-- 020: parcelas.socia_id (quem recebe a comissão_socia da parcela), preenchido pelo trigger a partir da venda.
alter table parcelas
add column if not exists socia_id uuid;

update parcelas p
set
  socia_id = v.socia_id
from
  vendas v
where
  v.id = p.venda_id
  and v.socia_id is not null;

create index if not exists parcelas_socia on parcelas (socia_id);

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
    insert into public.parcelas (venda_id, vendedor_id, numero, vencimento, valor, comissao, comissao_socia, socia_id)
    values (
      new.id, new.vendedor_id, k,
      (new.data + ((k - 1) * interval '1 month'))::date,
      case when k = n then total - v_parc * (n - 1) else v_parc end,
      case when k = n then new.comissao - c_parc * (n - 1) else c_parc end,
      case when k = n then new.comissao_socia - s_parc * (n - 1) else s_parc end,
      new.socia_id
    );
  end loop;
  return null;
end $$;
