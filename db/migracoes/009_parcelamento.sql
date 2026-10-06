-- ============================================================
-- 009: parcelamento no cartão + formas de pagamento "a_vista" / "cartao"
-- - Pix e dinheiro viram "a_vista" (pix removido).
-- - vendas.parcelas (1–12); só cartão pode parcelar.
-- - tabela parcelas: uma linha por parcela, com a fatia da comissão. A comissão
--   "cai" no vencimento de cada parcela (parcela k vence data + (k-1) meses; a 1ª
--   vence na data da venda). Mantida por trigger, então editar a venda refaz tudo.
-- ============================================================

alter table vendas drop constraint if exists vendas_pagamento_check;
update vendas set pagamento = 'a_vista' where pagamento in ('dinheiro', 'pix');
alter table vendas add constraint vendas_pagamento_check check (pagamento in ('a_vista', 'cartao'));

alter table vendas add column if not exists parcelas smallint not null default 1
  check (parcelas between 1 and 12);
alter table vendas add constraint vendas_parcelas_so_cartao
  check (parcelas = 1 or pagamento = 'cartao');

create table if not exists parcelas (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  vendedor_id uuid not null references perfis(id),
  numero smallint not null,
  vencimento date not null,
  valor numeric(12,2) not null,
  comissao numeric(12,2) not null,
  unique (venda_id, numero)
);
create index if not exists parcelas_vencimento on parcelas (vencimento);
create index if not exists parcelas_vendedor on parcelas (vendedor_id, vencimento);

-- refaz as parcelas da venda; a última absorve o resto dos centavos
create or replace function vendas_gerar_parcelas() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n int := new.parcelas;
  total numeric := round(new.quantidade * new.preco_unit, 2);
  v_parc numeric := round(total / n, 2);
  c_parc numeric := round(new.comissao / n, 2);
  k int;
begin
  delete from public.parcelas where venda_id = new.id;
  for k in 1..n loop
    insert into public.parcelas (venda_id, vendedor_id, numero, vencimento, valor, comissao)
    values (
      new.id, new.vendedor_id, k,
      (new.data + ((k - 1) * interval '1 month'))::date,
      case when k = n then total - v_parc * (n - 1) else v_parc end,
      case when k = n then new.comissao - c_parc * (n - 1) else c_parc end
    );
  end loop;
  return null;
end $$;

drop trigger if exists depois_de_gravar_venda on vendas;
create trigger depois_de_gravar_venda
  after insert or update of data, quantidade, preco_unit, parcelas on vendas
  for each row execute function vendas_gerar_parcelas();

revoke execute on function vendas_gerar_parcelas() from public, anon, authenticated;

-- vendas já existentes: 1 parcela cada (a_vista)
insert into parcelas (venda_id, vendedor_id, numero, vencimento, valor, comissao)
select id, vendedor_id, 1, data, round(quantidade * preco_unit, 2), comissao
from vendas v
where not exists (select 1 from parcelas p where p.venda_id = v.id);

alter table parcelas enable row level security;
create policy parcelas_ver on parcelas for select to authenticated using (true);
revoke all on parcelas from anon;
revoke insert, update, delete on parcelas from authenticated;

revoke update on vendas from authenticated;
grant update (data, quantidade, preco_unit, pagamento, parcelas) on vendas to authenticated;
