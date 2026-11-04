-- 043: vendedor e sócia dão baixa nas parcelas das próprias vendas (tela Parcelas, agora também no celular).
-- A baixa vale na hora. Vendedor e sócia só desfazem a baixa que eles mesmos deram, até 48 h depois (mesma janela de
-- editar venda) e não reescrevem a data de parcela já recebida; o gerente continua mexendo em tudo, a qualquer momento.
-- Quem deu cada baixa e quando fica em vendas.recebimentos_meta ({"1":{"por":"<uid>","em":"<timestamptz>"}}), na venda
-- pelo mesmo motivo de recebimentos: sobrevive à regeração das parcelas. Baixa sem meta (histórico da 042) só o gerente desfaz.
alter table vendas
add column if not exists recebimentos_meta jsonb not null default '{}'::jsonb;

create or replace function vendas_ajustar_recebimentos () returns trigger language plpgsql
set
  search_path = '' as $$
begin
  if new.pagamento <> 'cartao' then
    new.recebimentos := '{}'::jsonb;
    new.recebimentos_meta := '{}'::jsonb;
  else
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into new.recebimentos
    from jsonb_each(new.recebimentos) e
    where e.key::int <= new.parcelas;
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into new.recebimentos_meta
    from jsonb_each(new.recebimentos_meta) e
    where e.key::int <= new.parcelas;
  end if;
  return new;
end $$;

-- Dar baixa (p_data) ou desfazer (p_data nula) em parcelas de cartão. Espelhada em lib/parcelas.js para mensagem e botões.
create or replace function receber_parcelas (p_vendas uuid[], p_numeros int[], p_data date) returns void language plpgsql security definer
set
  search_path = '' as $$
declare
  v_uid uuid := (select auth.uid ());
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n int := coalesce(array_length(p_vendas, 1), 0);
  v_papel text;
  v_chave text;
  v_meta jsonb;
  v record;
  i int;
begin
  select papel into v_papel from public.perfis where id = v_uid;
  if v_papel is null or v_papel not in ('gerente', 'vendedor', 'socia') then
    raise exception 'Sem acesso.' using errcode = 'P0001';
  end if;
  if v_n = 0 or v_n > 200 or v_n <> coalesce(array_length(p_numeros, 1), 0) then
    raise exception 'Escolha de 1 a 200 parcelas.' using errcode = 'P0001';
  end if;
  for i in 1..v_n loop
    select id, data, pagamento, parcelas, vendedor_id, recebimentos, recebimentos_meta into v
    from public.vendas
    where id = p_vendas[i] and apagado_em is null
    for update;
    if not found then
      raise exception 'Venda não encontrada.' using errcode = 'P0001';
    end if;
    if v_papel <> 'gerente' and v.vendedor_id is distinct from v_uid then
      raise exception 'Só quem lançou a venda (ou o gerente) mexe nas parcelas dela.' using errcode = 'P0001';
    end if;
    if v.pagamento <> 'cartao' then
      raise exception 'Venda à vista já entra no caixa na data da venda.' using errcode = 'P0001';
    end if;
    if p_numeros[i] is null or p_numeros[i] < 1 or p_numeros[i] > v.parcelas then
      raise exception 'Parcela inválida.' using errcode = 'P0001';
    end if;
    v_chave := p_numeros[i]::text;
    if p_data is not null then
      if p_data > v_hoje then
        raise exception 'A data do recebimento não pode ser no futuro.' using errcode = 'P0001';
      end if;
      if p_data < v.data then
        raise exception 'A data do recebimento não pode ser antes da venda.' using errcode = 'P0001';
      end if;
      if v_papel <> 'gerente' and (v.recebimentos ->> v_chave) is not null then
        raise exception 'Esta parcela já tem baixa. Só o gerente muda a data.' using errcode = 'P0001';
      end if;
      update public.vendas
      set
        recebimentos = recebimentos || jsonb_build_object(v_chave, p_data),
        recebimentos_meta = recebimentos_meta || jsonb_build_object(v_chave, jsonb_build_object('por', v_uid, 'em', now()))
      where id = v.id;
    else
      if v_papel <> 'gerente' then
        v_meta := v.recebimentos_meta -> v_chave;
        if (v_meta ->> 'por') is distinct from v_uid::text or (v_meta ->> 'em') is null or (v_meta ->> 'em')::timestamptz <= now() - interval '48 hours' then
          raise exception 'Você só desfaz a baixa que você deu, até 48 horas depois. Peça ao gerente.' using errcode = 'P0001';
        end if;
      end if;
      update public.vendas
      set
        recebimentos = recebimentos - v_chave,
        recebimentos_meta = recebimentos_meta - v_chave
      where id = v.id;
    end if;
    update public.parcelas set recebido_em = p_data where venda_id = v.id and numero = p_numeros[i];
  end loop;
end $$;

-- Cada vendedor lê só as próprias parcelas; gerente e sócia (Resumos completo) leem todas.
drop policy if exists parcelas_ver on parcelas;

create policy parcelas_ver on parcelas for
select
  to authenticated using (
    vendedor_id = (
      select
        auth.uid ()
    )
    or (
      select
        eh_resumo_completo ()
    )
  );
