create schema if not exists private;
revoke all on schema private from public;
alter default privileges in schema private revoke execute on functions from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(btrim(email)) > 3)
);
create unique index profiles_email_lower_uidx on public.profiles (lower(email));

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_title_len check (char_length(btrim(title)) between 1 and 200),
  constraint documents_content_object check (jsonb_typeof(content) = 'object'),
  constraint documents_content_size check (octet_length(content::text) <= 2097152),
  constraint documents_revision_positive check (revision > 0)
);
create index documents_owner_updated_idx on public.documents (owner_id, updated_at desc);

create table public.document_shares (
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (document_id, user_id),
  constraint document_shares_permission_check check (permission in ('viewer', 'editor'))
);
create index document_shares_user_idx on public.document_shares (user_id, created_at desc);
create index document_shares_document_idx on public.document_shares (document_id);
