-- 033: a vitrine avisa quando restam poucas unidades (para travar o "+" do carrinho) e o pedido recusado
-- diz quantas sobraram. `restam` só aparece com saldo de 1 a 10; acima disso vem null, para não expor o estoque.
drop function if exists vitrine ();

create function vitrine () returns table (
  id uuid,
  nome text,
  descricao text,
  preco numeric,
  foto_url text,
  esgotado boolean,
  restam int,
  categoria_id uuid,
  categoria_nome text,
  categoria_ordem int,
  categoria_foto_url text
) language sql stable security definer
set
  search_path = '' as $$
  select
    p.id, p.nome, p.descricao, p.preco, p.foto_url,
    s.saldo <= 0,
    case when s.saldo >= 1 and s.saldo <= 10 then floor(s.saldo)::int end,
    k.id, k.nome, k.ordem, k.foto_url
  from public.produtos p
  left join public.categorias k on k.id = p.categoria_id
  cross join lateral (
    select
      coalesce((select sum(c.quantidade) from public.compras c where c.produto_id = p.id and c.apagado_em is null), 0)
      - coalesce((select sum(v.quantidade) from public.vendas v where v.produto_id = p.id and v.apagado_em is null), 0)
      + coalesce((select sum(e.diferenca) from public.contagens_estoque e where e.produto_id = p.id and e.apagado_em is null), 0)
      as saldo
  ) s
  where p.ativo and (k.id is null or k.ativo)
  order by p.nome;
$$;

revoke
execute on function vitrine ()
from
  public;

grant
execute on function vitrine () to anon,
authenticated;

-- criar_pedido: mesmas regras da 031; só as mensagens de estoque mudam (dizem quanto resta e que o carrinho foi ajustado)
create or replace function criar_pedido (p_nome text, p_telefone text, p_obs text, p_itens jsonb) returns jsonb language plpgsql security definer
set
  search_path = '' as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_cliente uuid := (select p.id from public.perfis p where p.id = (select auth.uid ()) and p.papel = 'cliente');
  v_item jsonb;
  v_qtd numeric;
  v_prod record;
  v_saldo numeric;
  v_itens jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_id uuid;
  v_numero bigint;
begin
  if length(v_nome) < 2 or length(v_nome) > 80 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if v_tel !~ '^[0-9]{10,13}$' then
    raise exception 'Informe um telefone com DDD.' using errcode = 'P0001';
  end if;
  if v_obs is not null and length(v_obs) > 500 then
    raise exception 'Observação longa demais.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O carrinho está vazio.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 30 then
    raise exception 'Itens demais num pedido (máximo 30).' using errcode = 'P0001';
  end if;

  if (select count(*) from public.pedidos where cliente_telefone = v_tel and criado_em > now() - interval '10 minutes') >= 3 then
    raise exception 'Você já enviou pedidos agora há pouco. Aguarde alguns minutos.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pedidos where criado_em > now() - interval '10 minutes') >= 30 then
    raise exception 'Muitos pedidos no momento. Tente de novo em alguns minutos.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    begin
      v_qtd := (v_item ->> 'quantidade')::numeric;
    exception when others then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end;
    if v_qtd is null or v_qtd < 1 or v_qtd > 99 or v_qtd <> trunc(v_qtd) then
      raise exception 'Quantidade inválida (1 a 99).' using errcode = 'P0001';
    end if;

    select p.id, p.nome, p.preco into v_prod
    from public.produtos p
    left join public.categorias k on k.id = p.categoria_id
    where p.id::text = v_item ->> 'produto_id' and p.ativo and (k.id is null or k.ativo);
    if not found then
      raise exception 'Um dos produtos não está mais disponível. Atualize a página.' using errcode = 'P0001';
    end if;
    if v_itens @> jsonb_build_array(jsonb_build_object('produto_id', v_prod.id)) then
      raise exception 'Produto repetido no carrinho.' using errcode = 'P0001';
    end if;

    v_saldo :=
      coalesce((select sum(c.quantidade) from public.compras c where c.produto_id = v_prod.id and c.apagado_em is null), 0)
      - coalesce((select sum(v.quantidade) from public.vendas v where v.produto_id = v_prod.id and v.apagado_em is null), 0)
      + coalesce((select sum(e.diferenca) from public.contagens_estoque e where e.produto_id = v_prod.id and e.apagado_em is null), 0);
    if v_saldo <= 0 then
      raise exception '% esgotou. Tiramos do carrinho; confira e envie de novo.', v_prod.nome using errcode = 'P0001';
    end if;
    if v_qtd > v_saldo then
      raise exception 'Restam só % de %. Ajustamos o carrinho; confira e envie de novo.', floor(v_saldo)::int, v_prod.nome using errcode = 'P0001';
    end if;

    v_itens := v_itens || jsonb_build_object('produto_id', v_prod.id, 'nome', v_prod.nome, 'quantidade', v_qtd, 'preco', v_prod.preco);
    v_total := v_total + v_qtd * v_prod.preco;
  end loop;

  insert into public.pedidos (cliente_nome, cliente_telefone, obs, itens, total, cliente_id)
  values (v_nome, v_tel, v_obs, v_itens, v_total, v_cliente)
  returning id, numero into v_id, v_numero;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'itens', v_itens);
end $$;

revoke
execute on function criar_pedido (text, text, text, jsonb)
from
  public;

grant
execute on function criar_pedido (text, text, text, jsonb) to anon,
authenticated;
