-- 019: a sócia segue com acesso de vendedor (despesas, lançamentos e resumo geral só para o gerente).
-- Ela mantém apenas a comissão extra sobre as vendas dos outros (mig. 018).
create or replace function eh_gerente () returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid ()) and papel = 'gerente'
  );
$$;
