-- Allow service-role updates (auth.uid() is null in that context).
-- Application code already enforces that only owners can rename documents.
create or replace function private.documents_before_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'document owner is immutable' using errcode = '42501';
  end if;
  if new.title is distinct from old.title
     and auth.uid() is not null
     and not private.is_document_owner(old.id) then
    raise exception 'only the owner can rename this document' using errcode = '42501';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
