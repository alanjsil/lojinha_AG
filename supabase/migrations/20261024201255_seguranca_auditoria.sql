-- 036: correções da auditoria de segurança (docs/auditoria-seguranca.md).
-- Regras que antes viviam só na Server Action passam a valer no banco, porque a chave anon é pública e
-- qualquer usuário logado consegue chamar o PostgREST direto, sem passar pelo Next.
--
-- 1) Saldo do produto numa função só (compras − vendas + diferença das contagens). Não é chamável pela API.
create or replace function saldo_do_produto (p_produto uuid) returns numeric language sql stable security definer
set
  search_path = '' as $$
  select
    coalesce((select sum(c.quantidade) from public.compras c where c.produto_id = p_produto and c.apagado_em is null), 0)
    - coalesce((select sum(v.quantidade) from public.vendas v where v.produto_id = p_produto and v.apagado_em is null), 0)
    + coalesce((select sum(e.diferenca) from public.contagens_estoque e where e.produto_id = p_produto and e.apagado_em is null), 0);
$$;

revoke
execute on function saldo_do_produto (uuid)
from
  public,
  anon,
  authenticated;

-- 2) Vendas: o vendedor (ou a sócia, que tem acesso de vendedor) edita e apaga só a própria venda, até 48 h depois
-- de lançá-la (conta o created_at, não a data da venda, que pode ser retroativa). Depois disso, só o gerente, sempre.
create or replace function pode_mexer_venda (p_vendedor uuid, p_criada timestamptz) returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid ()) and papel = 'gerente'
  )
  or (
    p_vendedor = (select auth.uid ())
    and p_criada > now() - interval '48 hours'
    and exists (
      select 1 from public.perfis
      where id = (select auth.uid ()) and papel in ('vendedor', 'socia')
    )
  );
$$;

revoke
execute on function pode_mexer_venda (uuid, timestamptz)
from
  public,
  anon;

grant
execute on function pode_mexer_venda (uuid, timestamptz) to authenticated;

drop policy if exists vendas_apagar on vendas;

create policy vendas_apagar on vendas for delete to authenticated using (pode_mexer_venda (vendedor_id, created_at));

drop policy if exists vendas_editar on vendas;

create policy vendas_editar on vendas
for update
  to authenticated using (pode_mexer_venda (vendedor_id, created_at))
with
  check (pode_mexer_venda (vendedor_id, created_at));

-- 3) Compras: só o gerente lança e exclui (editar já era só dele)
drop policy if exists compras_criar on compras;

create policy compras_criar on compras for insert to authenticated
with
  check (
    (
      select
        eh_gerente ()
    )
  );

drop policy if exists compras_apagar on compras;

create policy compras_apagar on compras for delete to authenticated using (
  (
    select
      eh_gerente ()
  )
);

-- 4) INSERT só nas colunas que o app envia. O resto (autoria, custo e comissão fotografados, exclusão lógica)
-- é do banco: por trigger ou por default, que não dependem de privilégio na coluna.
revoke insert on vendas
from
  authenticated;

grant insert (
  data,
  produto_id,
  quantidade,
  preco_unit,
  pagamento,
  parcelas,
  primeiro_vencimento,
  obs,
  grupo_id
) on vendas to authenticated;

revoke insert on compras
from
  authenticated;

grant insert (data, produto_id, quantidade, custo_unit, fornecedor, cartao_id, parcelas) on compras to authenticated;

revoke insert on contagens_estoque
from
  authenticated;

grant insert (data, produto_id, quantidade_contada, observacao) on contagens_estoque to authenticated;

-- 5) Venda não passa do saldo, nem se chamarem a API direto. AFTER para enxergar todos os itens do mesmo comando;
-- o lock por produto faz duas vendas simultâneas esperarem uma pela outra (cada uma já vê a venda da outra).
-- Editar para quantidade menor não é barrado (produto que já estava negativo por histórico antigo continua editável).
create or replace function vendas_checar_saldo () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  v_nome text;
begin
  if new.apagado_em is not null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.apagado_em is null and new.quantidade <= old.quantidade then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.produto_id::text, 0));
  if public.saldo_do_produto(new.produto_id) < 0 then
    select nome into v_nome from public.produtos where id = new.produto_id;
    raise exception 'Estoque insuficiente de %.', v_nome using errcode = 'P0001';
  end if;
  return null;
end $$;

revoke
execute on function vendas_checar_saldo ()
from
  public,
  anon,
  authenticated;

drop trigger if exists depois_de_gravar_venda_saldo on vendas;

create trigger depois_de_gravar_venda_saldo
after insert or update of quantidade,
apagado_em on vendas for each row
execute function vendas_checar_saldo ();

-- 6) Contagem: "o que o sistema achava" é calculado aqui, nunca vem do navegador (a diferença ajusta o estoque)
create or replace function contagens_preencher () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  if (select auth.uid ()) is not null then
    new.quantidade_sistema := public.saldo_do_produto(new.produto_id);
  end if;
  return new;
end $$;

revoke
execute on function contagens_preencher ()
from
  public,
  anon,
  authenticated;

drop trigger if exists antes_de_inserir_contagem on contagens_estoque;

create trigger antes_de_inserir_contagem
before insert on contagens_estoque for each row
execute function contagens_preencher ();

-- 7) Pedido: "entregue" só existe junto com uma venda real (lançada depois do pedido e ainda não ligada a outro),
-- entregue não volta, e as demais mudanças seguem a ordem novo → confirmado → pronto → entregue (cancelar de qualquer
-- aberto; cancelado só reabre como novo). Espelha mudancaValida de lib/pedido.js. SQL do admin (sem auth.uid) passa direto.
create or replace function pedidos_validar_status () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  v_etapas text[] := array['novo', 'confirmado', 'pronto', 'entregue'];
begin
  if (select auth.uid ()) is null or new.status = old.status then
    return new;
  end if;
  if old.status = 'entregue' then
    raise exception 'Pedido já entregue: exclua a venda para desfazer.' using errcode = 'P0001';
  end if;
  if new.status = 'cancelado' then
    return new;
  end if;
  if old.status = 'cancelado' then
    if new.status <> 'novo' then
      raise exception 'Pedido cancelado só pode ser reaberto.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if array_position(v_etapas, new.status) <= array_position(v_etapas, old.status) then
    raise exception 'Mudança de situação inválida.' using errcode = 'P0001';
  end if;
  if new.status = 'entregue' then
    if new.venda_ref is null
    or not exists (
      select 1 from public.vendas v
      where (v.id = new.venda_ref or v.grupo_id = new.venda_ref)
        and v.apagado_em is null
        and v.created_at >= old.criado_em
    ) then
      raise exception 'Só dá para marcar entregue lançando a venda do pedido.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.pedidos o where o.venda_ref = new.venda_ref and o.id <> new.id) then
      raise exception 'Essa venda já está ligada a outro pedido.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

revoke
execute on function pedidos_validar_status ()
from
  public,
  anon,
  authenticated;

drop trigger if exists antes_de_atualizar_pedido on pedidos;

create trigger antes_de_atualizar_pedido
before update of status on pedidos for each row
execute function pedidos_validar_status ();

-- 8) criar_pedido só pelo servidor do app. Antes qualquer um chamava /rest/v1/rpc/criar_pedido direto com a chave
-- anon e passava por cima de qualquer controle da Server Action. Agora só a service role executa; a Server Action
-- manda o IP (já com hash) e o cliente logado, e o banco limita por IP, por telefone e no total.
-- A mensagem de saldo só diz o número quando ele já é público na vitrine (1 a 10); acima disso é genérica.
alter table pedidos
add column if not exists ip_hash text;

create index if not exists pedidos_ip_hash on pedidos (ip_hash, criado_em desc)
where
  ip_hash is not null;

drop function if exists criar_pedido (text, text, text, jsonb);

create or replace function criar_pedido (
  p_nome text,
  p_telefone text,
  p_obs text,
  p_itens jsonb,
  p_cliente_id uuid default null,
  p_ip_hash text default null
) returns jsonb language plpgsql security definer
set
  search_path = '' as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_cliente uuid := (select p.id from public.perfis p where p.id = p_cliente_id and p.papel = 'cliente');
  v_ip text := nullif(btrim(coalesce(p_ip_hash, '')), '');
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

  -- freio contra robô/clique repetido: por rede (IP), por telefone e no total
  if v_ip is not null then
    if (select count(*) from public.pedidos where ip_hash = v_ip and criado_em > now() - interval '10 minutes') >= 5
    or (select count(*) from public.pedidos where ip_hash = v_ip and criado_em > now() - interval '24 hours') >= 30 then
      raise exception 'Muitos pedidos vindos desta conexão. Aguarde alguns minutos ou chame a loja no WhatsApp.' using errcode = 'P0001';
    end if;
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

    v_saldo := public.saldo_do_produto(v_prod.id);
    if v_saldo <= 0 then
      raise exception '% esgotou. Tiramos do carrinho; confira e envie de novo.', v_prod.nome using errcode = 'P0001';
    end if;
    if v_qtd > v_saldo then
      if v_saldo <= 10 then
        raise exception 'Restam só % de %. Ajustamos o carrinho; confira e envie de novo.', floor(v_saldo)::int, v_prod.nome using errcode = 'P0001';
      end if;
      raise exception 'Não temos essa quantidade de % agora. Peça menos e envie de novo.', v_prod.nome using errcode = 'P0001';
    end if;

    v_itens := v_itens || jsonb_build_object('produto_id', v_prod.id, 'nome', v_prod.nome, 'quantidade', v_qtd, 'preco', v_prod.preco);
    v_total := v_total + v_qtd * v_prod.preco;
  end loop;

  insert into public.pedidos (cliente_nome, cliente_telefone, obs, itens, total, cliente_id, ip_hash)
  values (v_nome, v_tel, v_obs, v_itens, v_total, v_cliente, v_ip)
  returning id, numero into v_id, v_numero;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'itens', v_itens);
end $$;

revoke
execute on function criar_pedido (text, text, text, jsonb, uuid, text)
from
  public,
  anon,
  authenticated;

grant
execute on function criar_pedido (text, text, text, jsonb, uuid, text) to service_role;

-- 9) perfis: ninguém cria perfil pela API (o trigger criar_perfil faz, como definer). Sem isso, uma policy de
-- INSERT criada por engano deixaria o usuário escolher o próprio papel e a própria comissão.
revoke insert on perfis
from
  authenticated;

-- 10) Push: a inscrição só entra pela Server Action (service role), que só aceita os serviços de push dos navegadores.
-- O INSERT direto do usuário (policy push_proprias_criar) deixava registrar qualquer https:// e fazer o servidor
-- chamar esse endereço (SSRF cega). NOT VALID: vale para o que entra daqui em diante, sem barrar linhas antigas.
drop policy if exists push_proprias_criar on push_inscricoes;

revoke insert on push_inscricoes
from
  authenticated;

alter table push_inscricoes
drop constraint if exists push_inscricoes_endpoint_host;

alter table push_inscricoes
add constraint push_inscricoes_endpoint_host check (
  endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com|([a-z0-9-]+\.)*push\.apple\.com)/'
) not valid;
