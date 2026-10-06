-- 011: lançamentos dos sócios (pró-labore, pagamento de comissão, saque, aporte). Só o gerente vê/cadastra/apaga.
-- Pró-labore entra no lucro líquido; os demais só na movimentação de caixa.
create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  tipo text not null check (tipo in ('pro_labore', 'pagamento_comissao', 'saque', 'aporte')),
  valor numeric(12,2) not null check (valor > 0),
  descricao text,
  vendedor_id uuid references perfis(id),
  created_by uuid default auth.uid() references perfis(id),
  created_at timestamptz not null default now(),
  check (tipo <> 'pagamento_comissao' or vendedor_id is not null)
);
create index if not exists lancamentos_data on lancamentos (data);
create index if not exists lancamentos_vendedor on lancamentos (vendedor_id);
create index if not exists lancamentos_created_by on lancamentos (created_by);

alter table lancamentos enable row level security;
create policy lancamentos_ver on lancamentos for select to authenticated
  using (exists (select 1 from perfis where id = (select auth.uid()) and papel = 'gerente'));
create policy lancamentos_criar on lancamentos for insert to authenticated
  with check (exists (select 1 from perfis where id = (select auth.uid()) and papel = 'gerente'));
create policy lancamentos_apagar on lancamentos for delete to authenticated
  using (exists (select 1 from perfis where id = (select auth.uid()) and papel = 'gerente'));
revoke all on lancamentos from anon;
