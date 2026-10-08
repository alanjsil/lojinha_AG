-- 017: novo tipo de lançamento "repasse" (vendedor entrega ao gerente o dinheiro das vendas que ficou em mãos).
-- Não altera o caixa total (só muda o dinheiro de mão). O vendedor lê apenas os próprios repasses.
alter table lancamentos
drop constraint if exists lancamentos_tipo_check;

alter table lancamentos
add constraint lancamentos_tipo_check check (
  tipo in ('pro_labore', 'pagamento_comissao', 'saque', 'aporte', 'capital_inicial', 'repasse')
);

alter table lancamentos
drop constraint if exists lancamentos_check;

alter table lancamentos
add constraint lancamentos_check check (
  tipo not in ('pagamento_comissao', 'repasse')
  or vendedor_id is not null
);

create policy lancamentos_ver_repasse_proprio on lancamentos for
select
  to authenticated using (
    tipo = 'repasse'
    and vendedor_id = auth.uid ()
  );
