-- 023: gerente edita compras e lançamentos, edita/exclui contagens (exclusão lógica, como na 021).
-- 1) Contagens ganham exclusão lógica
alter table contagens_estoque
add column if not exists apagado_em timestamptz,
add column if not exists apagado_por uuid references perfis (id) on delete set null;

drop trigger if exists antes_de_apagar_contagem on contagens_estoque;

create trigger antes_de_apagar_contagem
before delete on contagens_estoque for each row
execute function apagar_suave ();

create policy contagens_ocultar_apagadas on contagens_estoque as restrictive for
select
  to authenticated using (apagado_em is null);

-- editar/apagar contagem: só o gerente; editar só data, quantidade contada e observação
-- (quantidade_sistema é a fotografia do momento; a diferença é recalculada)
create policy contagens_editar on contagens_estoque
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

create policy contagens_apagar on contagens_estoque for delete to authenticated using (
  (
    select
      eh_gerente ()
  )
);

revoke
update on contagens_estoque
from
  authenticated;

grant
update (data, quantidade_contada, observacao) on contagens_estoque to authenticated;

-- 2) Compras e lançamentos: edição só do gerente, em colunas limitadas
create policy compras_editar on compras
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

revoke
update on compras
from
  authenticated;

grant
update (data, quantidade, custo_unit, fornecedor) on compras to authenticated;

create policy lancamentos_editar on lancamentos
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

revoke
update on lancamentos
from
  authenticated;

grant
update (data, valor, descricao, vendedor_id) on lancamentos to authenticated;

-- 3) Efeitos derivados: contagem apagada/editada muda o saldo e o custo médio; compra editada refaz o custo médio
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
      from public.contagens_estoque where produto_id = p_produto_id and apagado_em is null
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
after insert or delete or update of apagado_em,
data,
quantidade,
custo_unit on compras for each row
execute function compras_recalcular_custo ();

drop trigger if exists depois_de_editar_contagem on contagens_estoque;

create trigger depois_de_editar_contagem
after update of apagado_em,
data,
quantidade_contada on contagens_estoque for each row
execute function compras_recalcular_custo ();

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
        and e.apagado_em is null
    ),
    0
  ) as saldo
from
  produtos p;

-- 4) Log: contagens passam a registrar edição/exclusão; restaurar vale para contagens também
drop trigger if exists auditar_contagens on contagens_estoque;

create trigger auditar_contagens
after insert or update on contagens_estoque for each row
execute function auditar ();

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
  if p_tabela not in ('vendas', 'compras', 'despesas', 'lancamentos', 'contagens_estoque') then
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
