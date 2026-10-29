alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

create policy profiles_select_self on public.profiles
for select to authenticated
using (id = (select auth.uid()));

create policy documents_select on public.documents
for select to authenticated
using (private.can_view_document(id));

create policy documents_insert on public.documents
for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy documents_update on public.documents
for update to authenticated
using (private.can_edit_document(id))
with check (private.can_edit_document(id));

create policy documents_delete on public.documents
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy document_shares_select on public.document_shares
for select to authenticated
using (user_id = (select auth.uid()) or private.is_document_owner(document_id));

create policy document_shares_insert on public.document_shares
for insert to authenticated
with check (
  private.is_document_owner(document_id)
  and user_id <> (select auth.uid())
);

create policy document_shares_update on public.document_shares
for update to authenticated
using (private.is_document_owner(document_id))
with check (
  private.is_document_owner(document_id)
  and user_id <> (select auth.uid())
);

create policy document_shares_delete on public.document_shares
for delete to authenticated
using (private.is_document_owner(document_id));

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;

revoke all on table public.documents from public, anon, authenticated;
grant select, delete on table public.documents to authenticated;
grant insert (title, content, owner_id) on table public.documents to authenticated;
grant update (title, content) on table public.documents to authenticated;

revoke all on table public.document_shares from public, anon, authenticated;
grant select, delete on table public.document_shares to authenticated;
grant insert (document_id, user_id, permission) on table public.document_shares to authenticated;
grant update (permission) on table public.document_shares to authenticated;

grant usage on schema private to authenticated;
revoke all on schema private from public, anon;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

revoke all on function public.list_document_collaborators(uuid) from public, anon;
revoke all on function public.grant_document_share(uuid, text, text) from public, anon;
grant execute on function public.list_document_collaborators(uuid) to authenticated;
grant execute on function public.grant_document_share(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
