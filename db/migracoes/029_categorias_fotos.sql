-- 029: categorias de produto, foto e descrição (para a vitrine pública) e bucket de fotos.
-- Categoria é opcional (null = "Outros"); excluir a categoria solta os produtos dela.
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(btrim(nome)) between 1 and 60),
  ordem int not null default 0,
  foto_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table produtos
add column if not exists categoria_id uuid references categorias (id) on delete set null,
add column if not exists foto_url text,
add column if not exists descricao text check (length(descricao) <= 500);

create index if not exists produtos_categoria on produtos (categoria_id);

-- estoque_atual: colunas novas no fim (create or replace view não deixa reordenar)
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
  ) as saldo,
  p.categoria_id,
  p.foto_url,
  p.descricao
from
  produtos p;

alter table categorias enable row level security;

create policy categorias_ver on categorias for
select
  to authenticated using (true);

create policy categorias_criar on categorias for insert to authenticated
with
  check (
    (
      select
        eh_gerente ()
    )
  );

create policy categorias_editar on categorias
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

create policy categorias_apagar on categorias for delete to authenticated using (
  (
    select
      eh_gerente ()
  )
);

revoke all on categorias
from
  anon;

drop trigger if exists auditar_categorias on categorias;

create trigger auditar_categorias
after insert or update on categorias for each row
execute function auditar ();

-- Fotos: bucket público (a vitrine mostra sem login), até 2 MB, só imagem.
-- Só o gerente envia/troca/apaga; listar o bucket também fica só com ele.
insert into
  storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('fotos', 'fotos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy fotos_ver_gerente on storage.objects for
select
  to authenticated using (
    bucket_id = 'fotos'
    and (
      select
        public.eh_gerente ()
    )
  );

create policy fotos_enviar_gerente on storage.objects for insert to authenticated
with
  check (
    bucket_id = 'fotos'
    and (
      select
        public.eh_gerente ()
    )
  );

create policy fotos_trocar_gerente on storage.objects
for update
  to authenticated using (
    bucket_id = 'fotos'
    and (
      select
        public.eh_gerente ()
    )
  );

create policy fotos_apagar_gerente on storage.objects for delete to authenticated using (
  bucket_id = 'fotos'
  and (
    select
      public.eh_gerente ()
  )
);
