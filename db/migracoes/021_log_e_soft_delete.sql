-- 021: log de auditoria + exclusão lógica (soft delete).
-- Requer 018–020 aplicadas (vendas_gerar_parcelas e resumo_acumulado usam comissao_socia/socia_id).
-- 1) Exclusão lógica em vendas, compras, despesas e lançamentos
alter table vendas
add column if not exists apagado_em timestamptz,
add column if not exists apagado_por uuid references perfis (id) on delete set null;

alter table compras
add column if not exists apagado_em timestamptz,
add column if not exists apagado_por uuid references perfis (id) on delete set null;

alter table despesas
add column if not exists apagado_em timestamptz,
add column if not exists apagado_por uuid references perfis (id) on delete set null;

alter table lancamentos
add column if not exists apagado_em timestamptz,
add column if not exists apagado_por uuid references perfis (id) on delete set null;

-- DELETE vira UPDATE: marca apagado_em/apagado_por e cancela o delete físico.
-- security definer: o usuário do app não tem (e não deve ter) permissão de UPDATE nessas colunas.
create or replace function apagar_suave () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  execute format(
    'update public.%I set apagado_em = now(), apagado_por = auth.uid() where id = $1 and apagado_em is null',
    tg_table_name
  ) using old.id;
  return null;
end $$;

drop trigger if exists antes_de_apagar_venda on vendas;

create trigger antes_de_apagar_venda
before delete on vendas for each row
execute function apagar_suave ();

drop trigger if exists antes_de_apagar_compra on compras;

create trigger antes_de_apagar_compra
before delete on compras for each row
execute function apagar_suave ();

drop trigger if exists antes_de_apagar_despesa on despesas;

create trigger antes_de_apagar_despesa
before delete on despesas for each row
execute function apagar_suave ();

drop trigger if exists antes_de_apagar_lancamento on lancamentos;

create trigger antes_de_apagar_lancamento
before delete on lancamentos for each row
execute function apagar_suave ();

-- registros apagados somem para o app (policy restritiva soma-se às existentes)
create policy vendas_ocultar_apagadas on vendas as restrictive for
select
  to authenticated using (apagado_em is null);

create policy compras_ocultar_apagadas on compras as restrictive for
select
  to authenticated using (apagado_em is null);

create policy despesas_ocultar_apagadas on despesas as restrictive for
select
  to authenticated using (apagado_em is null);

create policy lancamentos_ocultar_apagados on lancamentos as restrictive for
select
  to authenticated using (apagado_em is null);

-- 2) Efeitos derivados passam a reagir à exclusão/restauração lógica
-- compras: custo médio refeito ao inserir, apagar ou restaurar (e ignora compras apagadas)
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
      from public.compras where produto_id = p_produto_id and apagado_em is null
    union all
    select data, created_at, 2, 'V', quantidade, null
      from public.vendas where produto_id = p_produto_id and apagado_em is null
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

  if v_custo is null then
    return;
  end if;

  perform pg_catalog.set_config('app.recalculando_cmp', 'on', true);
  update public.produtos set custo = round(v_custo, 2) where id = p_produto_id;
  perform pg_catalog.set_config('app.recalculando_cmp', 'off', true);
end $$;

drop trigger if exists depois_de_gravar_compra on compras;

create trigger depois_de_gravar_compra
after insert or delete or update of apagado_em on compras for each row
execute function compras_recalcular_custo ();

create or replace function produtos_bloquear_custo_manual () returns trigger language plpgsql
set
  search_path = '' as $$
begin
  if new.custo is distinct from old.custo
     and coalesce(pg_catalog.current_setting('app.recalculando_cmp', true), 'off') <> 'on'
     and exists (select 1 from public.compras where produto_id = new.id and apagado_em is null) then
    new.custo := old.custo;
  end if;
  return new;
end $$;

-- vendas: venda apagada não tem parcelas; restaurada, as parcelas são regeradas
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
  if new.apagado_em is not null then
    return null;
  end if;
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

drop trigger if exists depois_de_gravar_venda on vendas;

create trigger depois_de_gravar_venda
after insert or update of data,
quantidade,
preco_unit,
parcelas,
apagado_em on vendas for each row
execute function vendas_gerar_parcelas ();

-- estoque e resumo: filtro explícito (não depender só da RLS)
create or replace view estoque_atual
with
  (security_invoker = true) as
select
  p.id,
  p.nome,
  p.unidade,
  p.custo,
  p.preco,
  p.ativo,
  coalesce(
    (
      select
        sum(c.quantidade)
      from
        compras c
      where
        c.produto_id = p.id
        and c.apagado_em is null
    ),
    0
  ) - coalesce(
    (
      select
        sum(v.quantidade)
      from
        vendas v
      where
        v.produto_id = p.id
        and v.apagado_em is null
    ),
    0
  ) + coalesce(
    (
      select
        sum(e.diferenca)
      from
        contagens_estoque e
      where
        e.produto_id = p.id
    ),
    0
  ) as saldo
from
  produtos p;

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
  compras numeric
) language sql stable security invoker
set
  search_path = public as $$
  select
    coalesce((select sum(v.quantidade * v.preco_unit) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(v.quantidade * v.custo_unit) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(v.lucro) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(p.comissao + p.comissao_socia) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(d.valor) from despesas d where d.data <= ate and d.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pro_labore' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'capital_inicial' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'aporte' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'saque' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pagamento_comissao' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(p.valor) from parcelas p where p.vencimento <= ate), 0),
    coalesce((select sum(c.quantidade * c.custo_unit) from compras c where c.data <= ate and c.apagado_em is null), 0)
  where (select eh_gerente ());
$$;

revoke
execute on function resumo_acumulado (date)
from
  public,
  anon;

grant
execute on function resumo_acumulado (date) to authenticated;

-- 3) Log de auditoria: quem criou, editou, apagou ou restaurou o quê (só o gerente lê; ninguém altera pelo app)
create table if not exists log_auditoria (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  usuario_id uuid references perfis (id) on delete set null,
  tabela text not null,
  registro_id uuid not null,
  acao text not null check (acao in ('criou', 'editou', 'apagou', 'restaurou')),
  -- criou: depois = linha inteira; editou: só as colunas que mudaram; apagou: antes = linha inteira; restaurou: depois = linha inteira
  antes jsonb,
  depois jsonb
);

create index if not exists log_auditoria_registro on log_auditoria (tabela, registro_id);

create index if not exists log_auditoria_quando on log_auditoria (quando desc);

create index if not exists log_auditoria_usuario on log_auditoria (usuario_id);

alter table log_auditoria enable row level security;

create policy log_auditoria_ver on log_auditoria for
select
  to authenticated using (
    (
      select
        eh_gerente ()
    )
  );

revoke all on log_auditoria
from
  anon;

revoke insert,
update,
delete on log_auditoria
from
  authenticated;

create or replace function auditar () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  v_acao text;
  v_antes jsonb;
  v_depois jsonb;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    v_acao := 'criou';
    v_depois := to_jsonb(new);
    v_new := v_depois;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- nada mudou, ou recálculo automático do custo médio: não registra
    if v_old = v_new or coalesce(pg_catalog.current_setting('app.recalculando_cmp', true), 'off') = 'on' then
      return null;
    end if;
    if v_old ->> 'apagado_em' is null and v_new ->> 'apagado_em' is not null then
      v_acao := 'apagou';
      v_antes := v_old;
    elsif v_old ->> 'apagado_em' is not null and v_new ->> 'apagado_em' is null then
      v_acao := 'restaurou';
      v_depois := v_new;
    else
      v_acao := 'editou';
      select jsonb_object_agg(key, value) into v_antes from jsonb_each(v_old) where v_new -> key is distinct from value;
      select jsonb_object_agg(key, value) into v_depois from jsonb_each(v_new) where v_old -> key is distinct from value;
    end if;
  end if;

  insert into public.log_auditoria (usuario_id, tabela, registro_id, acao, antes, depois)
  values (auth.uid (), tg_table_name, (v_new ->> 'id')::uuid, v_acao, v_antes, v_depois);
  return null;
end $$;

revoke
execute on function auditar ()
from
  public,
  anon,
  authenticated;

revoke
execute on function apagar_suave ()
from
  public,
  anon,
  authenticated;

drop trigger if exists auditar_vendas on vendas;

create trigger auditar_vendas
after insert or update on vendas for each row
execute function auditar ();

drop trigger if exists auditar_compras on compras;

create trigger auditar_compras
after insert or update on compras for each row
execute function auditar ();

drop trigger if exists auditar_despesas on despesas;

create trigger auditar_despesas
after insert or update on despesas for each row
execute function auditar ();

drop trigger if exists auditar_lancamentos on lancamentos;

create trigger auditar_lancamentos
after insert or update on lancamentos for each row
execute function auditar ();

drop trigger if exists auditar_produtos on produtos;

create trigger auditar_produtos
after insert or update on produtos for each row
execute function auditar ();

drop trigger if exists auditar_contagens on contagens_estoque;

create trigger auditar_contagens
after insert on contagens_estoque for each row
execute function auditar ();
