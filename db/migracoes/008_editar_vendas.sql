-- ============================================================
-- 008: permitir editar vendas (quantidade, preço, pagamento, data)
-- Antes vendas só podiam ser apagadas. Agora o vendedor corrige as próprias
-- vendas (o gerente, qualquer uma), mas só nestas colunas: custo_unit,
-- comissao_pct, produto e vendedor continuam fotografados e intocáveis.
-- ============================================================

revoke update on vendas from authenticated;
grant update (data, quantidade, preco_unit, pagamento) on vendas to authenticated;

create policy vendas_editar on vendas for update to authenticated
  using (
    vendedor_id = (select auth.uid())
    or exists (select 1 from perfis where id = (select auth.uid()) and papel = 'gerente')
  )
  with check (
    vendedor_id = (select auth.uid())
    or exists (select 1 from perfis where id = (select auth.uid()) and papel = 'gerente')
  );
