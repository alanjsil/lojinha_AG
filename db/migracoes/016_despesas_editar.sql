-- Gerente pode editar despesas (sem política de UPDATE o RLS ignorava a edição em silêncio)
create policy despesas_editar on despesas
for update
  to authenticated using (
    exists (
      select
        1
      from
        perfis
      where
        perfis.id = auth.uid ()
        and perfis.papel = 'gerente'
    )
  )
with
  check (
    exists (
      select
        1
      from
        perfis
      where
        perfis.id = auth.uid ()
        and perfis.papel = 'gerente'
    )
  );
