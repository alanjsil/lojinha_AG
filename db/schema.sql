-- ============================================================
-- Schema da Lojinha A&G (Supabase Postgres)
-- Aplicar no SQL Editor do Supabase (ou via migração). Mudanças futuras
-- vão em db/migracoes/NNN_*.sql e também são refletidas aqui.
-- ============================================================

-- 1) Perfil de cada usuário (1:1 com auth.users). A comissão é definida só pelo admin (SQL/painel).
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  comissao_pct numeric(5,2) not null default 40 check (comissao_pct between 0 and 100),
  -- gerente vê/cadastra despesas e vê o resumo de todos; vendedor só o próprio. Só o admin muda (SQL/painel).
  papel text not null default 'vendedor' check (papel in ('gerente', 'vendedor')),
  created_at timestamptz not null default now()
);

create or replace function criar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)));
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function criar_perfil();

-- 2) Produtos: custo e preço são obrigatórios
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  unidade text not null default 'un',
  custo numeric(12,2) not null check (custo >= 0),
  preco numeric(12,2) not null check (preco > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Compras de mercadoria (entrada de estoque)
create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  produto_id uuid not null references produtos(id),
  quantidade numeric(12,2) not null check (quantidade > 0),
  custo_unit numeric(12,2) not null check (custo_unit >= 0),
  fornecedor text,
  created_by uuid default auth.uid() references perfis(id),
  created_at timestamptz not null default now()
);
create index if not exists compras_data on compras (data);

-- produtos.custo é o custo médio ponderado de todas as compras (valor total
-- comprado / quantidade total comprada), recalculado automaticamente a cada
-- compra lançada ou excluída. Sem nenhuma compra ainda, vale o custo digitado
-- à mão no cadastro do produto.
create or replace function recalcular_custo_medio(p_produto_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_qtd numeric(14,4);
  v_valor numeric(14,4);
begin
  select sum(quantidade), sum(quantidade * custo_unit)
    into v_qtd, v_valor
  from public.compras where produto_id = p_produto_id;

  if v_qtd is null or v_qtd = 0 then
    return;
  end if;

  update public.produtos set custo = round(v_valor / v_qtd, 2) where id = p_produto_id;
end $$;

create or replace function compras_recalcular_custo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_custo_medio(old.produto_id);
    return old;
  end if;
  perform public.recalcular_custo_medio(new.produto_id);
  return new;
end $$;

drop trigger if exists depois_de_gravar_compra on compras;
create trigger depois_de_gravar_compra after insert or delete on compras
  for each row execute function compras_recalcular_custo();

-- Depois da 1ª compra, o custo do produto passa a ser só o CMP calculado;
-- edição manual (tela de produto) é ignorada para não quebrar a média.
create or replace function produtos_bloquear_custo_manual() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.custo is distinct from old.custo
     and exists (select 1 from public.compras where produto_id = new.id) then
    new.custo := old.custo;
  end if;
  return new;
end $$;

drop trigger if exists antes_de_atualizar_produto on produtos;
create trigger antes_de_atualizar_produto before update on produtos
  for each row execute function produtos_bloquear_custo_manual();

-- 4) Vendas: um item por venda. Custo e % de comissão são "fotografados" no
-- momento da venda (trigger), então mudar o produto depois não altera o histórico.
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  produto_id uuid not null references produtos(id),
  vendedor_id uuid not null references perfis(id),
  quantidade numeric(12,2) not null check (quantidade > 0),
  preco_unit numeric(12,2) not null check (preco_unit > 0),
  custo_unit numeric(12,2) not null check (custo_unit >= 0),
  pagamento text not null check (pagamento in ('dinheiro', 'pix', 'cartao')),
  comissao_pct numeric(5,2) not null,
  lucro numeric(12,2) generated always as (round((preco_unit - custo_unit) * quantidade, 2)) stored,
  -- comissão = % do lucro; venda no prejuízo não gera comissão negativa
  comissao numeric(12,2) generated always as (round(greatest((preco_unit - custo_unit) * quantidade, 0) * comissao_pct / 100, 2)) stored,
  created_at timestamptz not null default now()
);
create index if not exists vendas_data on vendas (data);
create index if not exists vendas_vendedor on vendas (vendedor_id, data);

create or replace function vendas_preencher() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.vendedor_id := coalesce((select auth.uid()), new.vendedor_id);
  new.custo_unit := (select custo from public.produtos where id = new.produto_id);
  new.comissao_pct := (select comissao_pct from public.perfis where id = new.vendedor_id);
  return new;
end $$;

drop trigger if exists antes_de_inserir_venda on vendas;
create trigger antes_de_inserir_venda before insert on vendas
  for each row execute function vendas_preencher();

-- 5) Despesas (aluguel, luz, etc.)
create table if not exists despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  tipo text not null check (tipo in ('aluguel', 'agua', 'luz', 'internet', 'outros')),
  descricao text,
  valor numeric(12,2) not null check (valor > 0),
  created_by uuid default auth.uid() references perfis(id),
  created_at timestamptz not null default now()
);
create index if not exists despesas_data on despesas (data);

-- 6) Contagem cíclica: guarda o que o sistema achava e o que foi contado; a diferença ajusta o estoque
create table if not exists contagens_estoque (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  produto_id uuid not null references produtos(id),
  quantidade_sistema numeric(12,2) not null,
  quantidade_contada numeric(12,2) not null check (quantidade_contada >= 0),
  diferenca numeric(12,2) generated always as (quantidade_contada - quantidade_sistema) stored,
  observacao text,
  created_by uuid default auth.uid() references perfis(id),
  created_at timestamptz not null default now()
);

-- 7) Estoque atual = compras − vendas + ajustes de contagem
create or replace view estoque_atual with (security_invoker = true) as
select
  p.id, p.nome, p.unidade, p.custo, p.preco, p.ativo,
  coalesce((select sum(c.quantidade) from compras c where c.produto_id = p.id), 0)
  - coalesce((select sum(v.quantidade) from vendas v where v.produto_id = p.id), 0)
  + coalesce((select sum(e.diferenca) from contagens_estoque e where e.produto_id = p.id), 0) as saldo
from produtos p;

-- ============================================================
-- Segurança: RLS ligado em tudo. Só usuários logados (todos com o mesmo acesso).
-- Vendas, compras e contagens não são editáveis (apaga e lança de novo), para
-- não adulterar custo/comissão fotografados.
-- ============================================================
alter table perfis enable row level security;
alter table produtos enable row level security;
alter table compras enable row level security;
alter table vendas enable row level security;
alter table despesas enable row level security;
alter table contagens_estoque enable row level security;

create policy perfis_ver on perfis for select to authenticated using (true);
create policy perfis_editar_proprio on perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- o usuário só pode mudar o próprio nome; a comissão é do admin
revoke update on perfis from authenticated;
grant update (nome) on perfis to authenticated;

create policy produtos_ver on produtos for select to authenticated using (true);
create policy produtos_criar on produtos for insert to authenticated with check (true);
create policy produtos_editar on produtos for update to authenticated using (true) with check (true);

create policy compras_ver on compras for select to authenticated using (true);
create policy compras_criar on compras for insert to authenticated with check (true);
create policy compras_apagar on compras for delete to authenticated using (true);

create policy vendas_ver on vendas for select to authenticated using (true);
create policy vendas_criar on vendas for insert to authenticated with check (true);
create policy vendas_apagar on vendas for delete to authenticated using (true);

-- despesas: só gerente vê, cadastra ou apaga
create policy despesas_ver on despesas for select to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and papel = 'gerente'));
create policy despesas_criar on despesas for insert to authenticated
  with check (exists (select 1 from perfis where id = auth.uid() and papel = 'gerente'));
create policy despesas_apagar on despesas for delete to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and papel = 'gerente'));

create policy contagens_ver on contagens_estoque for select to authenticated using (true);
create policy contagens_criar on contagens_estoque for insert to authenticated with check (true);

revoke all on perfis, produtos, compras, vendas, despesas, contagens_estoque, estoque_atual from anon;

-- Funções de gatilho não devem ser chamáveis pela API pública (rpc)
revoke execute on function criar_perfil() from public, anon, authenticated;
revoke execute on function vendas_preencher() from public, anon, authenticated;
revoke execute on function recalcular_custo_medio(uuid) from public, anon, authenticated;
revoke execute on function compras_recalcular_custo() from public, anon, authenticated;
revoke execute on function produtos_bloquear_custo_manual() from public, anon, authenticated;
