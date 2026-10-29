create or replace function private.is_document_owner(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id and d.owner_id = (select auth.uid())
  );
$$;

create or replace function private.can_view_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id and d.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.document_shares s
    where s.document_id = p_document_id and s.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_edit_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id and d.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.document_shares s
    where s.document_id = p_document_id
      and s.user_id = (select auth.uid())
      and s.permission = 'editor'
  );
$$;

create or replace function private.documents_before_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'document owner is immutable' using errcode = '42501';
  end if;
  if new.title is distinct from old.title
     and not private.is_document_owner(old.id) then
    raise exception 'only the owner can rename this document' using errcode = '42501';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger documents_before_update
before update on public.documents
for each row execute function private.documents_before_update();

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;
  insert into public.profiles (id, email, display_name)
  values (new.id, lower(new.email),
          nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_updated()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles
  set email = lower(new.email), updated_at = now()
  where id = new.id and new.email is not null;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function private.handle_user_email_updated();

create or replace function public.list_document_collaborators(p_document_id uuid)
returns table (
  user_id uuid, email text, display_name text,
  permission text, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_document_owner(p_document_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select s.user_id, p.email, p.display_name, s.permission, s.created_at
    from public.document_shares s
    join public.profiles p on p.id = s.user_id
    where s.document_id = p_document_id
    order by s.created_at asc;
end;
$$;

create or replace function public.grant_document_share(
  p_document_id uuid,
  p_email text,
  p_permission text
)
returns table (
  user_id uuid, email text, display_name text,
  permission text, created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  if not private.is_document_owner(p_document_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_permission is null or p_permission not in ('viewer', 'editor') then
    raise exception 'invalid permission' using errcode = '22023';
  end if;

  v_email := lower(btrim(p_email));
  select p.id into v_user_id
  from public.profiles p
  where p.email = v_email;

  if v_user_id is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if v_user_id = (select auth.uid()) then
    raise exception 'cannot share with self' using errcode = 'P0001';
  end if;

  insert into public.document_shares (document_id, user_id, permission)
  values (p_document_id, v_user_id, p_permission);

  return query
    select s.user_id, p.email, p.display_name, s.permission, s.created_at
    from public.document_shares s
    join public.profiles p on p.id = s.user_id
    where s.document_id = p_document_id and s.user_id = v_user_id;
end;
$$;
