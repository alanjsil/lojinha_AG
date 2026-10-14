-- 031: conta de cliente, andamento do pedido e notificações push.
--
-- Até aqui, todo usuário logado era da equipe (e quem se cadastrasse pela API do Auth virava "vendedor").
-- Agora o cadastro aberto cria papel 'cliente'; o papel da equipe só vem do app_metadata, que só o admin
-- grava (scripts/criar-usuario.mjs). Uma policy RESTRICTIVE por tabela (soma-se às existentes com AND)
-- tira do cliente todo acesso aos dados da equipe; ele só enxerga o próprio perfil e os próprios pedidos.

-- 1) Perfil: papel cliente (padrão do cadastro aberto) e telefone (WhatsApp)
alter table perfis
drop constraint if exists perfis_papel_check;

alter table perfis
add constraint perfis_papel_check check (papel in ('gerente', 'vendedor', 'socia', 'cliente'));

alter table perfis
alter column papel
set default 'cliente';

alter table perfis
add column if not exists telefone text check (telefone ~ '^[0-9]{10,13}$');

-- equipe = papel no app_metadata (só o admin grava); qualquer outro cadastro é cliente
create or replace function criar_perfil () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  v_papel text := new.raw_app_meta_data ->> 'papel';
  v_tel text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'telefone', ''), '\D', '', 'g'), '');
begin
  if v_papel is null or v_papel not in ('gerente', 'vendedor', 'socia') then
    v_papel := 'cliente';
  end if;
  if v_tel !~ '^[0-9]{10,13}$' then
    v_tel := null;
  end if;
  insert into public.perfis (id, nome, papel, telefone)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)), v_papel, v_tel);
  return new;
end $$;

-- a equipe que já existe ganha o papel no app_metadata (o proxy usa isso para separar equipe e cliente)
update auth.users u
set
  raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('papel', p.papel)
from
  public.perfis p
where
  p.id = u.id
  and p.papel in ('gerente', 'vendedor', 'socia');

-- cliente pode corrigir nome e telefone; a comissão/papel seguem só com o admin
grant
update (nome, telefone) on perfis to authenticated;

create or replace function eh_equipe () returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid ()) and papel in ('gerente', 'vendedor', 'socia')
  );
$$;

revoke
execute on function eh_equipe ()
from
  public,
  anon;

grant
execute on function eh_equipe () to authenticated;

-- 2) Cliente fora dos dados da equipe (RESTRICTIVE: vale junto com as policies que já existem)
create policy so_equipe on produtos as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));
create policy so_equipe on categorias as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));
create policy so_equipe on compras as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));
create policy so_equipe on vendas as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));
create policy so_equipe on parcelas as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));
create policy so_equipe on despesas as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));
create policy so_equipe on lancamentos as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));
create policy so_equipe on contagens_estoque as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));
create policy so_equipe on log_auditoria as restrictive for all to authenticated using ((select eh_equipe ())) with check ((select eh_equipe ()));

-- perfis: cliente vê/edita só o próprio; a equipe vê todos (listas de vendedores filtram papel)
create policy so_equipe_ou_proprio on perfis as restrictive for all to authenticated using (
  (select eh_equipe ())
  or id = (select auth.uid ())
)
with
  check (
    (select eh_equipe ())
    or id = (select auth.uid ())
  );

-- 3) Pedido: dono (cliente logado), andamento e quando mudou
alter table pedidos
add column if not exists cliente_id uuid references perfis (id) on delete set null,
add column if not exists status_em timestamptz not null default now();

create index if not exists pedidos_cliente on pedidos (cliente_id, criado_em desc);

alter table pedidos
drop constraint if exists pedidos_status_check;

update pedidos
set
  status = 'entregue'
where
  status = 'atendido';

-- novo → confirmado → pronto → entregue (ou cancelado). Lançar a venda marca entregue.
alter table pedidos
add constraint pedidos_status_check check (status in ('novo', 'confirmado', 'pronto', 'entregue', 'cancelado'));

grant
update (status, status_em) on pedidos to authenticated;

-- cliente lê só os próprios pedidos e não altera nada; a equipe lê e atende todos
create policy so_equipe_ou_dono on pedidos as restrictive for
select
  to authenticated using (
    (select eh_equipe ())
    or cliente_id = (select auth.uid ())
  );

create policy so_equipe_atende on pedidos as restrictive
for update
  to authenticated using ((select eh_equipe ()))
with
  check ((select eh_equipe ()));

-- criar_pedido: cliente logado fica como dono do pedido (o resto é igual à 030)
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
      raise exception '% esgotou. Tire do carrinho para continuar.', v_prod.nome using errcode = 'P0001';
    end if;
    if v_qtd > v_saldo then
      raise exception 'Não temos essa quantidade de %. Diminua no carrinho.', v_prod.nome using errcode = 'P0001';
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

-- 4) Inscrições de push (um aparelho/navegador por linha). Cada um gerencia as próprias;
-- o envio é feito pelo servidor com a service role.
create table if not exists push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfis (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

create index if not exists push_inscricoes_usuario on push_inscricoes (usuario_id);

alter table push_inscricoes enable row level security;

create policy push_proprias_ver on push_inscricoes for
select
  to authenticated using (usuario_id = (select auth.uid ()));

create policy push_proprias_criar on push_inscricoes for insert to authenticated
with
  check (usuario_id = (select auth.uid ()));

create policy push_proprias_apagar on push_inscricoes for delete to authenticated using (usuario_id = (select auth.uid ()));

revoke all on push_inscricoes
from
  anon;

revoke
update on push_inscricoes
from
  authenticated;
