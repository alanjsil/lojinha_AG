-- 032: papel sempre igual nos dois lugares — perfis.papel (RLS, telas) e app_metadata.papel do Auth (proxy).
-- O Auth grava o app_metadata DEPOIS do insert em auth.users, então o criar_perfil da 031 nasce "cliente";
-- estes gatilhos acertam o perfil quando o app_metadata chega, e o app_metadata quando o admin muda o papel no perfil.
-- Só o admin escreve qualquer um dos dois (perfis.papel não tem grant de update para o app; app_metadata só com service role).

-- app_metadata (painel do Supabase / criar-usuario) → perfil
create or replace function papel_do_auth () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  v_papel text := new.raw_app_meta_data ->> 'papel';
begin
  if v_papel in ('gerente', 'vendedor', 'socia', 'cliente') then
    update public.perfis set papel = v_papel where id = new.id and papel is distinct from v_papel;
  end if;
  return null;
end $$;

drop trigger if exists ao_mudar_app_metadata on auth.users;

create trigger ao_mudar_app_metadata
after update of raw_app_meta_data on auth.users for each row
when (
  old.raw_app_meta_data ->> 'papel' is distinct from new.raw_app_meta_data ->> 'papel'
)
execute function papel_do_auth ();

-- perfil (SQL do admin) → app_metadata
create or replace function papel_para_auth () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('papel', new.papel)
  where id = new.id and raw_app_meta_data ->> 'papel' is distinct from new.papel;
  return null;
end $$;

drop trigger if exists ao_mudar_papel on perfis;

create trigger ao_mudar_papel
after update of papel on perfis for each row
when (old.papel is distinct from new.papel)
execute function papel_para_auth ();

revoke
execute on function papel_do_auth ()
from
  public,
  anon,
  authenticated;

revoke
execute on function papel_para_auth ()
from
  public,
  anon,
  authenticated;

-- o insert: cliente que se cadastra também leva o papel no app_metadata (fica explícito, mesmo valor)
create or replace function perfil_papel_inicial () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('papel', new.papel)
  where id = new.id and raw_app_meta_data ->> 'papel' is null;
  return null;
end $$;

drop trigger if exists ao_criar_perfil on perfis;

create trigger ao_criar_perfil
after insert on perfis for each row
execute function perfil_papel_inicial ();

revoke
execute on function perfil_papel_inicial ()
from
  public,
  anon,
  authenticated;

-- quem já existe e ainda não tem o papel no app_metadata recebe o do perfil
update auth.users u
set
  raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('papel', p.papel)
from
  public.perfis p
where
  p.id = u.id
  and u.raw_app_meta_data ->> 'papel' is null;
