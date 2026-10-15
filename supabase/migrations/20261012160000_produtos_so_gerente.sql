-- 026: só o gerente cadastra e edita produtos (nome, unidade, ativo, custo, preço).
drop policy if exists produtos_criar on produtos;

create policy produtos_criar on produtos for insert to authenticated
with
  check (
    (
      select
        eh_gerente ()
    )
  );

drop policy if exists produtos_editar on produtos;

create policy produtos_editar on produtos
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
