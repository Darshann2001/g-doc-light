# Submission — Ajaia Docs

## Live URL

**https://g-doc-light.vercel.app**

### Demo credentials

| Account | Email | Password |
|---|---|---|
| Primary | demo@ajaia.com | Demo@1234 |

---

## Feature inventory

### Auth

| Feature | Status | Notes |
|---|---|---|
| Sign up (email + password) | Complete | |
| Sign in | Complete | |
| Sign out | Complete | Icon button in header |
| Protected routes | Complete | Server + layout guard |
| Auth callback (`/auth/callback`) | Complete | Validates `next` as same-origin path |
| Password show/hide toggle | Complete | |
| Email enumeration protection | Partial | Supabase default behavior; disable in dashboard for clearer UX |

### Dashboard

| Feature | Status | Notes |
|---|---|---|
| List owned documents | Complete | |
| List shared documents | Complete | Separate section with role badge |
| Create document | Complete | Modal with title input |
| Rename document | Complete | Owner only |
| Delete document | Complete | Owner only; confirmation dialog |
| Search by title | Complete | Client-side, case-insensitive |
| Truncation notice (100 doc limit) | Complete | |
| Empty state | Complete | |
| Card grid layout | Complete | Google Docs–style thumbnail preview |
| Import .md / .txt | Complete | See Import section |

### Editor

| Feature | Status | Notes |
|---|---|---|
| Rich text editing | Complete | TipTap 3.x |
| Toolbar: bold, italic, underline | Complete | |
| Toolbar: headings (H1–H3) + paragraph | Complete | Block type dropdown |
| Toolbar: bullet list, numbered list | Complete | |
| Toolbar: undo / redo | Complete | |
| Autosave (debounced) | Complete | 1 s debounce, one in-flight PATCH |
| Revision-based conflict detection | Complete | 409 → "Out of sync" banner |
| Viewer read-only mode | Complete | No toolbar rendered |
| Editor role (content only, no rename) | Complete | Title input hidden for non-owners |
| Share dialog (from editor) | Complete | Owner only |
| Export to Markdown | Complete | Download button in header (stretch goal) |

### Sharing

| Feature | Status | Notes |
|---|---|---|
| Share by email | Complete | Owner only; exact registered email required |
| Grant viewer / editor permission | Complete | |
| Change collaborator permission | Complete | |
| Remove collaborator | Complete | |
| List collaborators | Complete | |
| Self-share prevented | Complete | 422 error |
| Unknown email error | Complete | 404 `USER_NOT_FOUND` |

### Import

| Feature | Status | Notes |
|---|---|---|
| Import .md file | Complete | |
| Import .txt file | Complete | |
| 1 MiB file size limit | Complete | |
| UTF-8 strict validation | Complete | |
| NUL byte rejection | Complete | |
| Markdown → TipTap JSON conversion | Complete | Headings, bold, italic, links, lists |
| Filename → document title | Complete | |

### Security

| Feature | Status | Notes |
|---|---|---|
| Server-side auth on every route | Complete | `supabase.auth.getUser()`, never `getSession()` |
| RLS policies | Complete | 3 migrations; all tables protected |
| Input validation | Complete | UUID, title, email, permission, content, revision |
| Content size limit (2 MiB) | Complete | Enforced server-side on every write |
| No XSS vectors | Complete | No `dangerouslySetInnerHTML`; TipTap renders JSON |
| Error responses sanitized | Complete | No SQL, stack traces, or Supabase internals leaked |
| Role-based access enforcement | Complete | Viewer blocked from edit; editor blocked from rename |
| Non-member → 404 (not 403) | Complete | Prevents document existence disclosure |
| Service role key server-only | Complete | No `NEXT_PUBLIC_` prefix |
| CSRF protection | Not implemented | Mitigated by `SameSite=Lax`; full `Origin`/`Sec-Fetch-Site` check not added |
| TipTap node whitelist (deep) | Partial | Structure validated; individual node types and link href protocols not whitelisted server-side |
| Rate limiting | Not implemented | Disclosed limitation |
| CSP headers | Not implemented | Disclosed limitation |

---

## Automated tests

| Suite | Status | Notes |
|---|---|---|
| Unit tests | Not implemented | Ran out of timebox; validation and conversion logic is straightforward but untested |
| RLS integration tests | Not implemented | Requires Docker / local Supabase |

Manual smoke testing was performed against the live Supabase project covering: auth flows, document CRUD, autosave, conflict state, sharing (grant/change/remove), import, and Markdown export.

---

## Stretch goals

| Feature | Status |
|---|---|
| Markdown export | **Complete** — Download button in editor header |
| Real-time presence indicators | Not implemented |
| Version history | Not implemented |
| Commenting / suggestion mode | Not implemented |

---

## Known issues and limitations

- **No automated tests** — the timebox did not allow unit or integration test coverage.
- **Shallow TipTap content validation** — server checks `type === "doc"` and array structure but does not whitelist individual node types or validate link `href` protocols. TipTap's renderer will not render unknown nodes, so XSS risk is low.
- **No CSRF check** — `SameSite=Lax` cookies provide partial mitigation.
- **No rate limiting** — brute-force on auth endpoints is not prevented at the application layer.
- **Email enumeration protection** — Supabase's default behavior returns a fake success on duplicate signup; disable in Supabase dashboard (Authentication → Sign In/Sign Up) for clearer error messaging.
- **Client-side search only** — filtered over the first 100 documents loaded; no full-text search.
- **No pagination** — up to 100 owned + 100 shared documents shown.
- **No ownership transfer** — deleting an account cascades to owned documents.
- **Conflict resolution is manual** — the "Out of sync" banner informs the user but does not auto-merge; last writer wins on next save.

---

## Database migrations

| File | Description |
|---|---|
| `20261029120000_01_schema.sql` | Tables: `profiles`, `documents`, `document_shares` |
| `20261029120001_02_functions_triggers.sql` | Triggers: profile sync, revision increment, ownership guard |
| `20261029120002_03_rls_grants.sql` | RLS policies + column grants |
| `20261029130000_04_fix_trigger_service_role.sql` | Patches `documents_before_update` to allow service-role writes (auth.uid() is null in that context) |

---

## Environment variables

| Variable | Required in | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Supabase anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | All | Base URL for auth redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Admin client for DB operations (never sent to browser) |

---

## Running locally

```bash
git clone https://github.com/Darshann2001/g-doc-light.git
cd g-doc-light
npm install
cp .env.local.example .env.local   # fill in the 4 env vars
npm run dev
```

Run migrations in Supabase SQL editor (in order):
1. `supabase/migrations/20261029120000_01_schema.sql`
2. `supabase/migrations/20261029120001_02_functions_triggers.sql`
3. `supabase/migrations/20261029120002_03_rls_grants.sql`
4. `supabase/migrations/20261029130000_04_fix_trigger_service_role.sql`
