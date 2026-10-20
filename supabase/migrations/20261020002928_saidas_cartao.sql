-- 034: despesa e compra no cartão. O lucro continua na data do gasto (competência); o caixa passa a contar
-- no vencimento de cada parcela da fatura (saidas_parcelas). À vista = 1 parcela vencendo na própria data.
-- 1) Cartões da loja (só o gerente cadastra; a equipe lê para escolher na compra). Sem exclusão: desativa.
create table if not exists cartoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  dia_fechamento smallint not null check (dia_fechamento between 1 and 28),
  dia_vencimento smallint not null check (dia_vencimento between 1 and 28),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table cartoes enable row level security;

create policy cartoes_ver on cartoes for
select
  to authenticated using (true);

create policy cartoes_criar on cartoes for insert to authenticated
with
  check (
    (
      select
        eh_gerente ()
    )
  );

create policy cartoes_editar on cartoes
for update
  to authenticated using (
    (
      select
        eh_gerente ()
    )
  )
with
  check (
    (
      select
        eh_gerente ()
    )
  );

create policy so_equipe on cartoes as restrictive for all to authenticated using (
  (
    select
      eh_equipe ()
  )
)
with
  check (
    (
      select
        eh_equipe ()
    )
  );

revoke all on cartoes
from
  anon;

revoke delete on cartoes
from
  authenticated;

drop trigger if exists auditar_cartoes on cartoes;

create trigger auditar_cartoes
after insert or update on cartoes for each row
execute function auditar ();

-- 2) Forma de pagamento em despesas e compras (sem cartão = à vista; só cartão parcela)
alter table despesas
add column if not exists cartao_id uuid references cartoes (id),
add column if not exists parcelas smallint not null default 1 check (parcelas between 1 and 12);

alter table despesas
add constraint despesas_parcela_so_cartao check (
  cartao_id is not null
  or parcelas = 1
);

alter table compras
add column if not exists cartao_id uuid references cartoes (id),
add column if not exists parcelas smallint not null default 1 check (parcelas between 1 and 12);

alter table compras
add constraint compras_parcela_so_cartao check (
  cartao_id is not null
  or parcelas = 1
);

create index if not exists despesas_cartao on despesas (cartao_id);

create index if not exists compras_cartao on compras (cartao_id);

-- a edição de compra (mig. 023) é por coluna: libera também a forma de pagamento
grant
update (cartao_id, parcelas) on compras to authenticated;

-- 3) Vencimento da fatura: gasto a partir do fechamento cai na fatura seguinte; a fatura vence no mesmo
-- mês do fechamento se o vencimento é depois dele, senão no mês seguinte (espelho em lib/cartao.js)
create or replace function vencimento_fatura (p_data date, p_fechamento int, p_vencimento int) returns date language sql immutable
set
  search_path = '' as $$
  select (
    date_trunc('month', p_data::timestamp)
    +pg_catalog.make_interval(months => (case when extract(day from p_data) >= p_fechamento then 1 else 0 end)
                                      + (case when p_vencimento > p_fechamento then 0 else 1 end))
  )::date + (p_vencimento - 1);
$$;

revoke
execute on function vencimento_fatura (date, int, int)
from
  public,
  anon;

-- 4) Saídas de caixa: uma linha por parcela (o app só lê; quem grava é o trigger)
create table if not exists saidas_parcelas (
  id uuid primary key default gen_random_uuid(),
  despesa_id uuid references despesas (id) on delete cascade,
  compra_id uuid references compras (id) on delete cascade,
  numero smallint not null,
  vencimento date not null,
  valor numeric(12, 2) not null,
  check ((despesa_id is null) <> (compra_id is null)),
  unique (despesa_id, numero),
  unique (compra_id, numero)
);

create index if not exists saidas_parcelas_vencimento on saidas_parcelas (vencimento);

alter table saidas_parcelas enable row level security;

create policy saidas_parcelas_ver on saidas_parcelas for
select
  to authenticated using (
    (
      select
        eh_resumo_completo ()
    )
  );

create policy so_equipe on saidas_parcelas as restrictive for all to authenticated using (
  (
    select
      eh_equipe ()
  )
)
with
  check (
    (
      select
        eh_equipe ()
    )
  );

revoke all on saidas_parcelas
from
  anon;

revoke insert,
update,
delete on saidas_parcelas
from
  authenticated;

-- refaz as parcelas da despesa/compra; apagada fica sem parcelas (restaurar regera).
-- Os dias do cartão são lidos agora: mudar o cartão depois não mexe no que já foi lançado.
create or replace function saidas_gerar_parcelas () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  n int := new.parcelas;
  despesa boolean := tg_table_name = 'despesas';
  total numeric;
  v_parc numeric;
  primeiro date := new.data;
  c record;
  k int;
begin
  if despesa then
    total := new.valor;
    delete from public.saidas_parcelas where despesa_id = new.id;
  else
    total := round(new.quantidade * new.custo_unit, 2);
    delete from public.saidas_parcelas where compra_id = new.id;
  end if;
  if new.apagado_em is not null then
    return null;
  end if;
  if new.cartao_id is not null then
    select dia_fechamento, dia_vencimento into c from public.cartoes where id = new.cartao_id;
    primeiro := public.vencimento_fatura(new.data, c.dia_fechamento, c.dia_vencimento);
  end if;
  v_parc := round(total / n, 2);
  for k in 1..n loop
    insert into public.saidas_parcelas (despesa_id, compra_id, numero, vencimento, valor)
    values (
      case when despesa then new.id end,
      case when despesa then null else new.id end,
      k,
      (primeiro + ((k - 1) * interval '1 month'))::date,
      case when k = n then total - v_parc * (n - 1) else v_parc end
    );
  end loop;
  return null;
end $$;

revoke
execute on function saidas_gerar_parcelas ()
from
  public,
  anon,
  authenticated;

drop trigger if exists depois_de_gravar_despesa on despesas;

create trigger depois_de_gravar_despesa
after insert or update of data,
valor,
cartao_id,
parcelas,
apagado_em on despesas for each row
execute function saidas_gerar_parcelas ();

drop trigger if exists depois_de_gravar_compra on compras;

create trigger depois_de_gravar_compra
after insert or update of data,
quantidade,
custo_unit,
cartao_id,
parcelas,
apagado_em on compras for each row
execute function saidas_gerar_parcelas ();

-- 5) O que já existe é à vista: uma parcela na própria data (o caixa histórico não muda)
insert into
  saidas_parcelas (despesa_id, numero, vencimento, valor)
select
  id,
  1,
  data,
  valor
from
  despesas
where
  apagado_em is null
on conflict do nothing;

insert into
  saidas_parcelas (compra_id, numero, vencimento, valor)
select
  id,
  1,
  data,
  round(quantidade * custo_unit, 2)
from
  compras
where
  apagado_em is null
on conflict do nothing;

-- 6) Caixa: despesas e compras saem no vencimento da parcela; cartao_a_pagar = gasto até a data que vence depois dela
drop function if exists resumo_acumulado (date);

create function resumo_acumulado (ate date) returns table (
  receita numeric,
  custo numeric,
  lucro numeric,
  comissoes numeric,
  despesas numeric,
  pro_labore numeric,
  capital_inicial numeric,
  aportes numeric,
  saques numeric,
  comissoes_pagas numeric,
  recebido numeric,
  compras numeric,
  cartao_a_pagar numeric
) language sql stable security invoker
set
  search_path = public as $$
  select
    coalesce((select sum(v.quantidade * v.preco_unit) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(v.quantidade * v.custo_unit) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(v.lucro) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(p.comissao + p.comissao_socia) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(s.valor) from saidas_parcelas s where s.despesa_id is not null and s.vencimento <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pro_labore' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'capital_inicial' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'aporte' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'saque' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pagamento_comissao' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(p.valor) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(s.valor) from saidas_parcelas s where s.compra_id is not null and s.vencimento <= ate), 0),
    coalesce((
      select sum(s.valor)
      from saidas_parcelas s
      left join despesas d on d.id = s.despesa_id
      left join compras c on c.id = s.compra_id
      where s.vencimento > ate and coalesce(d.data, c.data) <= ate
    ), 0)
  where (select eh_resumo_completo ());
$$;

revoke
execute on function resumo_acumulado (date)
from
  public,
  anon;

grant
execute on function resumo_acumulado (date) to authenticated;
