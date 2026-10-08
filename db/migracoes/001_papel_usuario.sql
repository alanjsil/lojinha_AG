-- ============================================================
-- 001: papel do usuário (gerente | vendedor)
-- Gerente: vê e cadastra despesas, vê o resumo de todos.
-- Vendedor: não vê/cadastra despesas, vê só o próprio resumo.
-- Papel é alterado só pelo admin (SQL/painel), igual comissao_pct.
-- ============================================================
alter table perfis
add column if not exists papel text not null default 'vendedor' check (papel in ('gerente', 'vendedor'));

-- o usuário continua podendo mudar só o próprio nome; papel e comissão são do admin
revoke
update on perfis
from
  authenticated;

grant
update (nome) on perfis to authenticated;

-- Despesas: só gerente vê, cadastra ou apaga.
drop policy if exists despesas_ver on despesas;

drop policy if exists despesas_criar on despesas;

drop policy if exists despesas_apagar on despesas;

create policy despesas_ver on despesas for
select
  to authenticated using (
    exists (
      select
        1
      from
        perfis
      where
        id = auth.uid ()
        and papel = 'gerente'
    )
  );

create policy despesas_criar on despesas for insert to authenticated
with
  check (
    exists (
      select
        1
      from
        perfis
      where
        id = auth.uid ()
        and papel = 'gerente'
    )
  );

create policy despesas_apagar on despesas for delete to authenticated using (
  exists (
    select
      1
    from
      perfis
    where
      id = auth.uid ()
      and papel = 'gerente'
  )
);
