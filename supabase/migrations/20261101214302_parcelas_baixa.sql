-- 042: baixa de parcelas (recebimento real). Até aqui toda parcela vencida contava como recebida; agora a parcela de
-- cartão só entra no caixa (e a comissão dela só cai) quando o gerente dá baixa, na data em que o dinheiro entrou.
-- Cliente que antecipa → baixa antes do vencimento; cliente que atrasa → fica "em aberto" até a baixa.
-- À vista continua recebida na data da venda, sem baixa.
--
-- Onde a baixa mora: em vendas.recebimentos ({"1":"2026-11-03",...}, chave = nº da parcela), porque vendas_gerar_parcelas
-- apaga e recria as parcelas a cada edição/exclusão/restauração da venda e a baixa não pode se perder. parcelas.recebido_em
-- é a cópia que as consultas usam. A coluna recebimentos não está na lista do trigger depois_de_gravar_venda: dar baixa
-- não regera parcelas (vencimentos antigos, anteriores à 035, nunca se movem).

alter table vendas
add column if not exists recebimentos jsonb not null default '{}'::jsonb;

alter table parcelas
add column if not exists recebido_em date;

create index if not exists parcelas_recebido_em on parcelas (recebido_em);

create index if not exists parcelas_em_aberto on parcelas (vencimento)
where
  recebido_em is null;

-- parcelas regeradas herdam a baixa guardada na venda
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
    insert into public.parcelas (venda_id, vendedor_id, numero, vencimento, valor, comissao, comissao_socia, socia_id, recebido_em)
    values (
      new.id, new.vendedor_id, k,
      (base + ((k - 1) * interval '1 month'))::date,
      case when k = n then total - v_parc * (n - 1) else v_parc end,
      case when k = n then new.comissao - c_parc * (n - 1) else c_parc end,
      case when k = n then new.comissao_socia - s_parc * (n - 1) else s_parc end,
      new.socia_id,
      case when new.pagamento <> 'cartao' then new.data else nullif(new.recebimentos ->> (k::text), '')::date end
    );
  end loop;
  return null;
end $$;

-- venda que vira à vista perde as baixas; menos parcelas descarta as baixas das que sobraram de fora
-- (para não reaparecerem se o número de parcelas voltar a subir)
create or replace function vendas_ajustar_recebimentos () returns trigger language plpgsql
set
  search_path = '' as $$
begin
  if new.pagamento <> 'cartao' then
    new.recebimentos := '{}'::jsonb;
  else
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into new.recebimentos
    from jsonb_each(new.recebimentos) e
    where e.key::int <= new.parcelas;
  end if;
  return new;
end $$;

revoke
execute on function vendas_ajustar_recebimentos ()
from
  public,
  anon,
  authenticated;

drop trigger if exists antes_de_editar_venda_recebimentos on vendas;

create trigger antes_de_editar_venda_recebimentos
before update of parcelas,
pagamento on vendas for each row
execute function vendas_ajustar_recebimentos ();

-- Histórico: o caixa de hoje não pode mudar. À vista = recebida na data; cartão que já venceu = recebida no vencimento
-- (o gerente desfaz na tela Parcelas o que na verdade ainda não caiu). O auditar fica de fora para não encher o log.
alter table vendas disable trigger auditar_vendas;

-- cartão com parcelas geradas: as datas gravadas em parcelas valem (inclusive as anteriores à 035)
update vendas v
set
  recebimentos = x.r
from
  (
    select
      p.venda_id,
      jsonb_object_agg(p.numero::text, p.vencimento) as r
    from
      parcelas p
    where
      p.vencimento <= (now() at time zone 'America/Sao_Paulo')::date
    group by
      p.venda_id
  ) x
where
  x.venda_id = v.id
  and v.pagamento = 'cartao';

-- venda apagada não tem parcelas: usa a regra de geração (é a que será refeita ao restaurar)
update vendas v
set
  recebimentos = x.r
from
  (
    select
      v2.id,
      jsonb_object_agg(k::text, (b.base + ((k - 1) * interval '1 month'))::date) as r
    from
      vendas v2
      cross join lateral (
        select
          coalesce(v2.primeiro_vencimento, (date_trunc('month', v2.data) + interval '1 month' + interval '7 days')::date) as base
      ) b
      cross join lateral generate_series(1, v2.parcelas) k
    where
      v2.apagado_em is not null
      and v2.pagamento = 'cartao'
      and (b.base + ((k - 1) * interval '1 month'))::date <= (now() at time zone 'America/Sao_Paulo')::date
    group by
      v2.id
  ) x
where
  x.id = v.id;

alter table vendas enable trigger auditar_vendas;

update parcelas p
set
  recebido_em = p.vencimento
from
  vendas v
where
  v.id = p.venda_id
  and v.pagamento <> 'cartao';

update parcelas p
set
  recebido_em = (v.recebimentos ->> (p.numero::text))::date
from
  vendas v
where
  v.id = p.venda_id
  and v.pagamento = 'cartao'
  and (v.recebimentos ->> (p.numero::text)) is not null;

-- Dar baixa (p_data) ou desfazer (p_data nula) em parcelas de cartão. Só o gerente. security definer: o app não tem
-- UPDATE em vendas.recebimentos nem em parcelas. O UPDATE em vendas passa pelo auditar_vendas (log: quem e quando).
create or replace function receber_parcelas (p_vendas uuid[], p_numeros int[], p_data date) returns void language plpgsql security definer
set
  search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n int := coalesce(array_length(p_vendas, 1), 0);
  v record;
  i int;
begin
  if not public.eh_gerente () then
    raise exception 'Só o gerente pode dar baixa nas parcelas.' using errcode = 'P0001';
  end if;
  if v_n = 0 or v_n > 200 or v_n <> coalesce(array_length(p_numeros, 1), 0) then
    raise exception 'Escolha de 1 a 200 parcelas.' using errcode = 'P0001';
  end if;
  for i in 1..v_n loop
    select id, data, pagamento, parcelas into v
    from public.vendas
    where id = p_vendas[i] and apagado_em is null
    for update;
    if not found then
      raise exception 'Venda não encontrada.' using errcode = 'P0001';
    end if;
    if v.pagamento <> 'cartao' then
      raise exception 'Venda à vista já entra no caixa na data da venda.' using errcode = 'P0001';
    end if;
    if p_numeros[i] is null or p_numeros[i] < 1 or p_numeros[i] > v.parcelas then
      raise exception 'Parcela inválida.' using errcode = 'P0001';
    end if;
    if p_data is not null then
      if p_data > v_hoje then
        raise exception 'A data do recebimento não pode ser no futuro.' using errcode = 'P0001';
      end if;
      if p_data < v.data then
        raise exception 'A data do recebimento não pode ser antes da venda.' using errcode = 'P0001';
      end if;
      update public.vendas set recebimentos = recebimentos || jsonb_build_object(p_numeros[i]::text, p_data) where id = v.id;
    else
      update public.vendas set recebimentos = recebimentos - (p_numeros[i]::text) where id = v.id;
    end if;
    update public.parcelas set recebido_em = p_data where venda_id = v.id and numero = p_numeros[i];
  end loop;
end $$;

revoke
execute on function receber_parcelas (uuid[], int[], date)
from
  public,
  anon;

grant
execute on function receber_parcelas (uuid[], int[], date) to authenticated;

-- Caixa pelo recebimento real. recebido e comissoes contam em recebido_em; em_aberto = parcelas que venceram até a data
-- e ainda não tinham sido recebidas nela (com a data de hoje é o atrasado; com data futura, o que a projeção espera receber).
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
  cartao_a_pagar numeric,
  em_aberto numeric
) language sql stable security invoker
set
  search_path = public as $$
  select
    coalesce((select sum(v.quantidade * v.preco_unit) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(v.quantidade * v.custo_unit) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(v.lucro) from vendas v where v.data <= ate and v.apagado_em is null), 0),
    coalesce((select sum(p.comissao + p.comissao_socia) from parcelas p where p.recebido_em <= ate), 0),
    coalesce((select sum(s.valor) from saidas_parcelas s where s.despesa_id is not null and s.vencimento <= ate), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pro_labore' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'capital_inicial' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'aporte' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'saque' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(l.valor) from lancamentos l where l.tipo = 'pagamento_comissao' and l.data <= ate and l.apagado_em is null), 0),
    coalesce((select sum(p.valor) from parcelas p where p.recebido_em <= ate), 0),
    coalesce((select sum(s.valor) from saidas_parcelas s where s.compra_id is not null and s.vencimento <= ate), 0),
    coalesce((
      select sum(s.valor)
      from saidas_parcelas s
      left join despesas d on d.id = s.despesa_id
      left join compras c on c.id = s.compra_id
      where s.vencimento > ate and coalesce(d.data, c.data) <= ate
    ), 0),
    coalesce((select sum(p.valor) from parcelas p where p.vencimento <= ate and (p.recebido_em is null or p.recebido_em > ate)), 0)
  where (select eh_resumo_completo ());
$$;

revoke
execute on function resumo_acumulado (date)
from
  public,
  anon;

grant
execute on function resumo_acumulado (date) to authenticated;
