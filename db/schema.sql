-- ============================================================
-- Schema da Lojinha A&G (Supabase Postgres)
-- Aplicar no SQL Editor do Supabase (ou via migração). Mudanças futuras
-- vão em db/migracoes/NNN_*.sql e também são refletidas aqui.
-- ============================================================
-- 1) Perfil de cada usuário (1:1 com auth.users). A comissão é definida só pelo admin (SQL/painel).
create table if not exists perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  comissao_pct numeric(5, 2) not null default 40 check (comissao_pct between 0 and 100),
  -- gerente vê/cadastra despesas e vê o resumo de todos; vendedor só o próprio; socia = vendedor + comissão extra
  -- sobre as vendas dos outros (018). Só o admin muda (SQL/painel).
  papel text not null default 'vendedor' check (papel in ('gerente', 'vendedor', 'socia')),
  created_at timestamptz not null default now()
);

create or replace function criar_perfil () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)));
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;

create trigger ao_criar_usuario
after insert on auth.users for each row
execute function criar_perfil ();

-- 2) Produtos: custo e preço são obrigatórios
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  unidade text not null default 'un',
  custo numeric(12, 2) not null check (custo >= 0),
  preco numeric(12, 2) not null check (preco > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Compras de mercadoria (entrada de estoque)
create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  produto_id uuid not null references produtos (id),
  quantidade numeric(12, 2) not null check (quantidade > 0),
  custo_unit numeric(12, 2) not null check (custo_unit >= 0),
  fornecedor text,
  created_by uuid default auth.uid () references perfis (id),
  apagado_em timestamptz,
  apagado_por uuid references perfis (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists compras_data on compras (data);

create index if not exists compras_produto on compras (produto_id);

create index if not exists compras_created_by on compras (created_by);

-- produtos.custo é o custo médio móvel sobre o saldo em estoque: o histórico
-- (compras, vendas e contagens) é refeito em ordem cronológica a cada compra
-- lançada ou excluída.
--   compra: novo custo = (saldo antes * custo atual + qtd * custo da compra) / (saldo antes + qtd)
--   venda e contagem só alteram a quantidade, nunca o custo
--   saldo zerado/negativo antes da compra: custo passa a ser o da compra
-- Sem nenhuma compra ainda, vale o custo digitado à mão no cadastro do produto.
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

-- Depois da 1ª compra, o custo do produto passa a ser só o CMP calculado;
-- edição manual (tela de produto) é ignorada para não quebrar a média
-- (exceto dentro de recalcular_custo_medio, que liga app.recalculando_cmp).
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

drop trigger if exists antes_de_atualizar_produto on produtos;

create trigger antes_de_atualizar_produto
before update on produtos for each row
execute function produtos_bloquear_custo_manual ();

-- eh_gerente: só o gerente tem acesso administrativo; a sócia segue com acesso de vendedor (018/019)
create or replace function eh_gerente () returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid ()) and papel = 'gerente'
  );
$$;

revoke
execute on function eh_gerente ()
from
  public,
  anon;

grant
execute on function eh_gerente () to authenticated;

-- 4) Vendas: um item por venda. Custo e % de comissão são "fotografados" no
-- momento da venda (trigger), então mudar o produto depois não altera o histórico.
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  produto_id uuid not null references produtos (id),
  vendedor_id uuid not null references perfis (id),
  quantidade numeric(12, 2) not null check (quantidade > 0),
  preco_unit numeric(12, 2) not null check (preco_unit > 0),
  custo_unit numeric(12, 2) not null check (custo_unit >= 0),
  pagamento text not null check (pagamento in ('a_vista', 'cartao')),
  -- só cartão parcela; a comissão cai junto com cada parcela (tabela parcelas)
  parcelas smallint not null default 1 check (parcelas between 1 and 12),
  check (
    parcelas = 1
    or pagamento = 'cartao'
  ),
  comissao_pct numeric(5, 2) not null,
  lucro numeric(12, 2) generated always as (round((preco_unit - custo_unit) * quantidade, 2)) stored,
  -- comissão = % do lucro; venda no prejuízo não gera comissão negativa
  comissao numeric(12, 2) generated always as (round(greatest((preco_unit - custo_unit) * quantidade, 0) * comissao_pct / 100, 2)) stored,
  -- 018: a sócia ganha comissão extra (socia_pct do perfil dela) sobre vendas de outros vendedores
  socia_id uuid,
  socia_pct numeric(5, 2) not null default 0,
  comissao_socia numeric(12, 2) generated always as (round(greatest((preco_unit - custo_unit) * quantidade, 0) * socia_pct / 100, 2)) stored,
  apagado_em timestamptz,
  apagado_por uuid references perfis (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vendas_data on vendas (data);

create index if not exists vendas_vendedor on vendas (vendedor_id, data);

create index if not exists vendas_produto on vendas (produto_id);

create or replace function vendas_preencher () returns trigger language plpgsql
set
  search_path = '' as $$
begin
  new.vendedor_id := coalesce((select auth.uid()), new.vendedor_id);
  new.custo_unit := (select custo from public.produtos where id = new.produto_id);
  new.comissao_pct := (select comissao_pct from public.perfis where id = new.vendedor_id);
  -- a sócia ganha também sobre as vendas dos outros (as dela já pagam a comissão normal)
  select id, comissao_pct into new.socia_id, new.socia_pct
    from public.perfis
    where papel = 'socia' and id <> new.vendedor_id
    order by created_at
    limit 1;
  if new.socia_id is null then
    new.socia_pct := 0;
  end if;
  return new;
end $$;

drop trigger if exists antes_de_inserir_venda on vendas;

create trigger antes_de_inserir_venda
before insert on vendas for each row
execute function vendas_preencher ();

-- 4b) Parcelas: uma linha por parcela da venda, com a fatia da comissão. A parcela k vence
-- data + (k-1) meses (a 1ª na data da venda). Mantida por trigger; a última absorve os centavos.
create table if not exists parcelas (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas (id) on delete cascade,
  vendedor_id uuid not null references perfis (id),
  numero smallint not null,
  vencimento date not null,
  valor numeric(12, 2) not null,
  comissao numeric(12, 2) not null,
  comissao_socia numeric(12, 2) not null default 0,
  socia_id uuid,
  unique (venda_id, numero)
);

create index if not exists parcelas_vencimento on parcelas (vencimento);

create index if not exists parcelas_vendedor on parcelas (vendedor_id, vencimento);

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

-- 5) Despesas (aluguel, luz, etc.)
create table if not exists despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  tipo text not null check (
    tipo in ('aluguel', 'agua', 'luz', 'internet', 'gasolina', 'alimentacao', 'pedagio', 'outros')
  ),
  descricao text,
  valor numeric(12, 2) not null check (valor > 0),
  created_by uuid default auth.uid () references perfis (id),
  apagado_em timestamptz,
  apagado_por uuid references perfis (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists despesas_data on despesas (data);

create index if not exists despesas_created_by on despesas (created_by);

-- 5b) Lançamentos dos sócios (pró-labore, pagamento de comissão, saque, aporte, capital inicial)
create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  tipo text not null check (
    tipo in ('pro_labore', 'pagamento_comissao', 'saque', 'aporte', 'capital_inicial', 'repasse')
  ),
  valor numeric(12, 2) not null check (valor > 0),
  descricao text,
  vendedor_id uuid references perfis (id),
  created_by uuid default auth.uid () references perfis (id),
  apagado_em timestamptz,
  apagado_por uuid references perfis (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    tipo not in ('pagamento_comissao', 'repasse')
    or vendedor_id is not null
  )
);

create index if not exists lancamentos_data on lancamentos (data);

create index if not exists lancamentos_vendedor on lancamentos (vendedor_id);

create index if not exists lancamentos_created_by on lancamentos (created_by);

-- 6) Contagem cíclica: guarda o que o sistema achava e o que foi contado; a diferença ajusta o estoque
create table if not exists contagens_estoque (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  produto_id uuid not null references produtos (id),
  quantidade_sistema numeric(12, 2) not null,
  quantidade_contada numeric(12, 2) not null check (quantidade_contada >= 0),
  diferenca numeric(12, 2) generated always as (quantidade_contada - quantidade_sistema) stored,
  observacao text,
  created_by uuid default auth.uid () references perfis (id),
  created_at timestamptz not null default now()
);

create index if not exists contagens_produto on contagens_estoque (produto_id);

create index if not exists contagens_created_by on contagens_estoque (created_by);

-- 7) Estoque atual = compras − vendas + ajustes de contagem
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

-- 014: caixa real (recebido, capital inicial, aportes, compras). Caixa = recebido + capital inicial + aportes − compras − despesas − saques − pró-labore − comissões pagas.
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

-- ============================================================
-- Segurança: RLS ligado em tudo. Só usuários logados (todos com o mesmo acesso).
-- Compras e contagens não são editáveis (apaga e lança de novo). Vendas só
-- editam data, quantidade, preço e pagamento, para não adulterar custo/comissão fotografados.
-- ============================================================
alter table perfis enable row level security;

alter table produtos enable row level security;

alter table compras enable row level security;

alter table vendas enable row level security;

alter table despesas enable row level security;

alter table lancamentos enable row level security;

alter table contagens_estoque enable row level security;

create policy perfis_ver on perfis for
select
  to authenticated using (true);

create policy perfis_editar_proprio on perfis
for update
  to authenticated using (
    id = (
      select
        auth.uid ()
    )
  )
with
  check (
    id = (
      select
        auth.uid ()
    )
  );

-- o usuário só pode mudar o próprio nome; a comissão é do admin
revoke
update on perfis
from
  authenticated;

grant
update (nome) on perfis to authenticated;

create policy produtos_ver on produtos for
select
  to authenticated using (true);

create policy produtos_criar on produtos for insert to authenticated
with
  check (true);

create policy produtos_editar on produtos
for update
  to authenticated using (true)
with
  check (true);

create policy compras_ver on compras for
select
  to authenticated using (true);

create policy compras_criar on compras for insert to authenticated
with
  check (true);

create policy compras_apagar on compras for delete to authenticated using (true);

create policy vendas_ver on vendas for
select
  to authenticated using (true);

create policy vendas_criar on vendas for insert to authenticated
with
  check (true);

create policy vendas_apagar on vendas for delete to authenticated using (true);

-- editar: o vendedor corrige as próprias vendas, o gerente qualquer uma; só estas colunas
create policy vendas_editar on vendas
for update
  to authenticated using (
    vendedor_id = (
      select
        auth.uid ()
    )
    or (
      select
        eh_gerente ()
    )
  )
with
  check (
    vendedor_id = (
      select
        auth.uid ()
    )
    or (
      select
        eh_gerente ()
    )
  );

revoke
update on vendas
from
  authenticated;

grant
update (data, quantidade, preco_unit, pagamento, parcelas) on vendas to authenticated;

-- parcelas: só leitura para o app; quem grava é o trigger
alter table parcelas enable row level security;

create policy parcelas_ver on parcelas for
select
  to authenticated using (true);

revoke all on parcelas
from
  anon;

revoke insert,
update,
delete on parcelas
from
  authenticated;

-- despesas: só gerente vê, cadastra ou apaga
create policy despesas_ver on despesas for
select
  to authenticated using (
    (
      select
        eh_gerente ()
    )
  );

create policy despesas_criar on despesas for insert to authenticated
with
  check (
    (
      select
        eh_gerente ()
    )
  );

create policy despesas_apagar on despesas for delete to authenticated using (
  (
    select
      eh_gerente ()
  )
);

create policy despesas_editar on despesas
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

-- lançamentos: só gerente (o vendedor lê só os próprios repasses)
create policy lancamentos_ver_repasse_proprio on lancamentos for
select
  to authenticated using (
    tipo = 'repasse'
    and vendedor_id = (
      select
        auth.uid ()
    )
  );

create policy lancamentos_ver on lancamentos for
select
  to authenticated using (
    (
      select
        eh_gerente ()
    )
  );

create policy lancamentos_criar on lancamentos for insert to authenticated
with
  check (
    (
      select
        eh_gerente ()
    )
  );

create policy lancamentos_apagar on lancamentos for delete to authenticated using (
  (
    select
      eh_gerente ()
  )
);

create policy contagens_ver on contagens_estoque for
select
  to authenticated using (true);

create policy contagens_criar on contagens_estoque for insert to authenticated
with
  check (true);

revoke all on perfis,
produtos,
compras,
vendas,
despesas,
lancamentos,
contagens_estoque,
estoque_atual
from
  anon;

-- Funções de gatilho não devem ser chamáveis pela API pública (rpc)
revoke
execute on function criar_perfil ()
from
  public,
  anon,
  authenticated;

revoke
execute on function vendas_preencher ()
from
  public,
  anon,
  authenticated;

revoke
execute on function recalcular_custo_medio (uuid)
from
  public,
  anon,
  authenticated;

revoke
execute on function compras_recalcular_custo ()
from
  public,
  anon,
  authenticated;

revoke
execute on function produtos_bloquear_custo_manual ()
from
  public,
  anon,
  authenticated;

revoke
execute on function vendas_gerar_parcelas ()
from
  public,
  anon,
  authenticated;

-- 021: exclusão lógica (DELETE vira UPDATE de apagado_em) e log de auditoria
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
