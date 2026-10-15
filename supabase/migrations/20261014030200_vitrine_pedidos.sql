-- 030: vitrine pública (sem login) e pedidos feitos pelos clientes.
-- O anon não lê nenhuma tabela: só chama vitrine() e criar_pedido(), que expõem o mínimo
-- (sem custo nem saldo numérico) e recalculam o preço pelo banco.
-- Pedido da loja: cliente monta o carrinho, o pedido cai aqui e o vendedor lança a venda depois.
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  criado_em timestamptz not null default now(),
  cliente_nome text not null check (length(cliente_nome) between 2 and 80),
  cliente_telefone text not null check (cliente_telefone ~ '^[0-9]{10,13}$'),
  obs text check (length(obs) <= 500),
  -- [{ produto_id, nome, quantidade, preco }] com o preço do banco na hora do pedido
  itens jsonb not null,
  total numeric(12, 2) not null check (total > 0),
  status text not null default 'novo' check (status in ('novo', 'atendido', 'cancelado')),
  -- venda lançada a partir do pedido: grupo_id (vários itens) ou id da venda (um item)
  venda_ref uuid,
  atendido_por uuid references perfis (id) on delete set null,
  atendido_em timestamptz
);

create index if not exists pedidos_status on pedidos (status, criado_em desc);

create index if not exists pedidos_telefone on pedidos (cliente_telefone, criado_em desc);

create index if not exists pedidos_atendido_por on pedidos (atendido_por);

alter table pedidos enable row level security;

-- todos da equipe veem e atendem os pedidos
create policy pedidos_ver on pedidos for
select
  to authenticated using (true);

create policy pedidos_atender on pedidos
for update
  to authenticated using (true)
with
  check (true);

revoke all on pedidos
from
  anon;

revoke insert,
update,
delete on pedidos
from
  authenticated;

grant
update (status, venda_ref, atendido_por, atendido_em) on pedidos to authenticated;

-- Produtos da vitrine: ativos, de categoria ativa (ou sem categoria). Esgotado = saldo ≤ 0; o saldo em si não sai.
create or replace function vitrine () returns table (
  id uuid,
  nome text,
  descricao text,
  preco numeric,
  foto_url text,
  esgotado boolean,
  categoria_id uuid,
  categoria_nome text,
  categoria_ordem int,
  categoria_foto_url text
) language sql stable security definer
set
  search_path = '' as $$
  select
    p.id, p.nome, p.descricao, p.preco, p.foto_url,
    (
      coalesce((select sum(c.quantidade) from public.compras c where c.produto_id = p.id and c.apagado_em is null), 0)
      - coalesce((select sum(v.quantidade) from public.vendas v where v.produto_id = p.id and v.apagado_em is null), 0)
      + coalesce((select sum(e.diferenca) from public.contagens_estoque e where e.produto_id = p.id and e.apagado_em is null), 0)
    ) <= 0,
    k.id, k.nome, k.ordem, k.foto_url
  from public.produtos p
  left join public.categorias k on k.id = p.categoria_id
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

-- Grava o pedido do carrinho. Valida tudo de novo (o navegador do cliente não é confiável):
-- produto ativo, com saldo para a quantidade, preço do banco, limites de tamanho e de frequência.
create or replace function criar_pedido (p_nome text, p_telefone text, p_obs text, p_itens jsonb) returns jsonb language plpgsql security definer
set
  search_path = '' as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_item jsonb;
  v_qtd numeric;
  v_prod record;
  v_saldo numeric;
  v_itens jsonb := '[]'::jsonb;
  v_total numeric := 0;
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

  -- freio contra robô/clique repetido: por telefone e no total
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
    -- o saldo é conferido por linha, então o mesmo produto não pode vir duas vezes
    if v_itens @> jsonb_build_array(jsonb_build_object('produto_id', v_prod.id)) then
      raise exception 'Produto repetido no carrinho.' using errcode = 'P0001';
    end if;

    v_saldo :=
      coalesce((select sum(c.quantidade) from public.compras c where c.produto_id = v_prod.id and c.apagado_em is null), 0)
      - coalesce((select sum(v.quantidade) from public.vendas v where v.produto_id = v_prod.id and v.apagado_em is null), 0)
      + coalesce((select sum(e.diferenca) from public.contagens_estoque e where e.produto_id = v_prod.id and e.apagado_em is null), 0);
    if v_saldo <= 0 then
      raise exception '% esgotou. Tire do carrinho para continuar.', v_prod.nome using errcode = 'P0001';
    end if;
    if v_qtd > v_saldo then
      raise exception 'Não temos essa quantidade de %. Diminua no carrinho.', v_prod.nome using errcode = 'P0001';
    end if;

    v_itens := v_itens || jsonb_build_object('produto_id', v_prod.id, 'nome', v_prod.nome, 'quantidade', v_qtd, 'preco', v_prod.preco);
    v_total := v_total + v_qtd * v_prod.preco;
  end loop;

  insert into public.pedidos (cliente_nome, cliente_telefone, obs, itens, total)
  values (v_nome, v_tel, v_obs, v_itens, v_total)
  returning numero into v_numero;

  return jsonb_build_object('numero', v_numero, 'total', v_total, 'itens', v_itens);
end $$;

revoke
execute on function criar_pedido (text, text, text, jsonb)
from
  public;

grant
execute on function criar_pedido (text, text, text, jsonb) to anon,
authenticated;
