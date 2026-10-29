# PROJECT_SPEC.md — Ajaia Docs

**Status:** Approved for implementation (v1.1, security-audited)
**Date:** 2026-10-29
**Repository:** `D:\work\g-doc-light` (no app code at time of writing; not yet a git repository)
**Audience:** Implementing engineer / AI coding agent
**Canonical:** This file is the single source of truth for product, architecture, API, database, UI, testing, and delivery decisions.

---

## 1. Project Overview

Ajaia Docs is a lightweight, collaborative, rich-text document editor inspired by Google Docs. It lets an authenticated user create, rename, edit, save, reopen, import, and share documents. Documents persist in Supabase PostgreSQL, and every read/write is protected by Row Level Security (RLS) plus explicit server-side authorization.

The product is a focused writing surface, not an analytics product. The visual target is a calm, typography-led productivity SaaS: warm neutral surfaces, restrained indigo accent, clear hierarchy, and minimal decoration.

### 1.1 Repository inspection result

- At inspection, the working directory had no source, manifests, environment files, or configuration. This specification is the only file added.
- There is no existing git repository, ownership metadata, or framework constraint to preserve.
- The project will be scaffolded from scratch with the stack in Section 6.
- Node `v22.20.0`, npm `10.9.3`, and git `2.47.1` are available on the development machine. pnpm is not usable; use npm and commit `package-lock.json`.
- No Supabase project, Vercel project, credentials, or external integration exists yet. Their configuration is an external prerequisite (Section 18).

### 1.2 Delivery constraint

Total implementation budget is 4–6 hours. The committed plan targets **6 hours including a 15-minute buffer**. P0 must ship before P1 or P2. See Section 19 for the schedule and cut order.

---

## 2. Product Goals and Non-Goals

### 2.1 Goals

1. Deliver complete, reliable core document workflows end-to-end.
2. Make sharing safe: viewers cannot write, editors can write content but cannot rename/delete/manage sharing, owners control the document lifecycle.
3. Persist structured rich-text formatting across save, refresh, and reopen.
4. Import `.txt` and `.md` into editable documents without executing untrusted HTML/script.
5. Provide a polished, responsive, accessible UI with honest loading, empty, success, conflict, and error states.
6. Enforce authorization in PostgreSQL RLS and again in server operations, so UI hiding is never the security boundary.
7. Produce verifiable documentation, automated tests, a deployment, and a walkthrough.

### 2.2 Non-goals (explicitly out of scope)

- Real-time multi-cursor collaboration, presence, or live content sync.
- Comments, mentions, suggestions, or review workflows.
- Version history, restore, or diffing.
- PDF export, DOCX import/export, or print-specific layout.
- Public link sharing, anonymous access, or invitations to unregistered emails.
- Ownership transfer, team workspaces, folders, or organization roles.
- Password reset, MFA, SSO, or account management screens.
- Offline editing or conflict merge (conflicts are detected, not merged).
- Full-text content search; search is limited to document titles (P1).
- Mobile native apps, i18n, analytics, and billing.
- A separate backend, Redis, queues, microservices, or a client state library.

Any P2 idea (Section 20) must not start until the Definition of Done (Section 22) is satisfied.

---

## 3. Users and Core User Journeys

### 3.1 Target users

- **Owner ("Avery")**: creates documents, writes, imports, shares, renames, deletes. Primary persona.
- **Editor ("Emery")**: receives edit access, edits content in shared documents, cannot rename/delete/manage sharing.
- **Viewer ("Vera")**: receives read access, reads formatted content, cannot write.
- **Unrelated user ("Uma")**: authenticated but has no grant; must see nothing about the document.
- **Anonymous visitor**: not signed in; must be redirected to login and must receive no data from APIs.

The UI is single-tenant per user account; no team concept.

### 3.2 Core journeys

**J1 — First document.** Sign up or log in → empty dashboard → "New document" → editor with default title → type/format → see "Saving…" then "Saved" → refresh → content and formatting persist.

**J2 — Organize and reopen.** Dashboard shows owned and shared documents with updated time and access badge → search by title (P1) → open a document → edit → return to dashboard → rename (owner) → reopen.

**J3 — Import.** Dashboard → Import → choose `.md`/`.txt` ≤ 1 MiB → validation → document created with filename-derived title → editor shows converted content → edit and save.

**J4 — Share and enforce.** Owner opens Share → enters registered recipient email → chooses Viewer or Editor → adds → recipient logs in, sees document under "Shared with me", opens it → viewer has no editing controls; editor can edit content but not title, delete, or sharing → unrelated user gets not-found behavior and is denied at API/DB level.

**J5 — Failure recovery.** Network fails during autosave → clear error with retry; concurrent edit produces revision conflict → banner offering "Load latest" (discard local) or "Overwrite" (explicit, after confirmation); deleted/revoked access mid-session → read-only or not-found state, no silent data loss.

---

## 4. Functional Requirements

Each requirement has an ID and is verified by acceptance criteria in Section 17 and the manual smoke test.

### 4.1 Document lifecycle

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-01 | Create a document with default title "Untitled document" and empty TipTap document JSON. | Create action returns/opens a persisted document owned by the current user; dashboard shows it; refresh retains it. |
| FR-02 | Rename a document (owner only). | Owner can rename via dashboard dialog or editor title; title persists after refresh/reopen; non-owner title updates are rejected by server and DB. |
| FR-03 | Edit, save, reopen content. | Content persists in Supabase as validated TipTap JSON; refresh and reopen restore exact supported structure/marks. |
| FR-04 | Rich-text formatting: bold, italic, underline, headings H1–H3, bulleted lists, numbered lists. | Toolbar toggles each; active states reflect selection; formatting survives save/reload; headings provide the required text-size variation. Inline arbitrary font sizes are out of scope. |
| FR-05 | Import `.txt` and `.md` files. | Supported files ≤ 1 MiB become new documents; unsupported extension, oversize, empty, binary/invalid UTF-8, and parse failures show specific errors; raw HTML is never executed. |
| FR-06 | Ownership and sharing with registered users by email. | Owner can grant viewer/editor access, change permission, and revoke; duplicates, self-share, unknown email, and unauthorized operations produce clear errors. |
| FR-07 | Visible distinction between owned and shared documents. | Dashboard has All Documents / My Documents / Shared with Me; each row shows access badge (Owner, Editor, Viewer) and updated time. |
| FR-08 | Persist content, formatting, and sharing records. | All state lives in PostgreSQL; refresh and new sessions retain documents and grants; created/updated timestamps maintained. |
| FR-09 | Server-side authorization and validation. | Every API validates session and input; DB RLS enforces access for direct PostgREST calls; owner is always derived from `auth.uid()`, never client input. |
| FR-10 | Loading, empty, success, and error states. | Dashboard/editor/import/share expose skeleton, empty, success, validation, permission, conflict, and network states as specified in Sections 12–13. |
| FR-11 | At least one meaningful automated test. | Unit tests specified in Section 17 pass; integration tests pass when the local DB prerequisite exists, otherwise they are explicitly reported as not run. Results are reported honestly. |

### 4.2 Flow A — Access and dashboard (FR-01, FR-02, FR-07, FR-10)

1. Anonymous user visiting `/` is redirected to `/login?next=%2F`.
2. Login/signup validates inputs, shows pending state, prevents duplicate submit, and reports errors inline.
3. After auth, dashboard loads owned documents and documents shared with the user in two groups.
4. Top navigation shows product identity, current user email, and sign-out.
5. Sidebar (desktop) / filter chips (mobile) expose All Documents, My Documents, Shared with Me with counts.
6. "New document" is the primary action; "Import" is secondary.
7. Rows show title, updated timestamp, access badge, and a contextual menu (Open; owner-only: Rename, Share, Delete).
8. Delete requires an AlertDialog confirmation naming the document; after deletion the list updates and a toast confirms.
9. Search filters the loaded lists by title (P1). Empty query restores lists.
10. Observed states: skeleton rows while loading; empty state with create/import CTAs; filtered-empty state; error state with Retry.

**Acceptance:** All actions are keyboard operable; unauthorized actions do not appear for non-owners; every visible control performs a real operation or is not rendered.

### 4.3 Flow B — Editing (FR-03, FR-04, FR-10)

1. Opening a document loads it server-side with the user's access role.
2. Owner sees editable title and full toolbar; editor sees read-only title, full toolbar, no Share/Delete; viewer sees read-only title and content, no toolbar, "View only" badge.
3. New documents start with title "Untitled document" and an empty paragraph with focus in the body.
4. Toolbar supports paragraph/heading H1–H3, bold, italic, underline, bulleted list, numbered list, undo, redo.
5. Changes trigger debounced autosave (800 ms; maximum wait 4 s) with visible status: Unsaved, Saving, Saved, Error, Conflict.
6. `Ctrl/Cmd+S` flushes immediately. Title blur flushes (owner). Navigating back flushes and waits up to 2 s.
7. `beforeunload` warns when unsaved/in-flight changes exist.
8. Saves include `baseRevision`; server applies conditional update. A stale write returns 409 and never overwrites newer content silently.
9. Network errors leave content intact, show retry, and retry twice with backoff before surfacing Error.
10. Access downgraded to viewer (403) or document deleted/access revoked (404) stops autosave and shows the appropriate state.
11. Editor fits desktop and mobile; no horizontal page scroll at 320 px.

**Acceptance:** Format → refresh → formatting intact; two rapid edits result in one final persisted state; simulated stale revision yields a conflict UI, not data loss.

### 4.4 Flow C — File import (FR-05)

1. Dashboard Import opens a dialog with a file input/drop zone accepting `.txt,.md`.
2. Client pre-validates extension, 1 MiB max, non-empty; server re-validates (client validation is UX only).
3. Server decodes UTF-8 strictly, rejects NUL/binary content, converts Markdown subset or plain text to whitelisted TipTap JSON, and creates a document owned by the caller.
4. Success navigates to the new document and toasts; failure keeps the dialog open with a specific message.
5. Exact supported formats, mapping, and size limit are documented in README and Section 14.
6. No uploaded content is rendered as HTML, inserted via `dangerouslySetInnerHTML`, or executed.

**Acceptance:** `.md` with headings/bold/italic/lists imports formatted; `.txt` imports as paragraphs; `.pdf`, 2 MiB file, empty file, invalid UTF-8, and malformed content produce distinct errors and create nothing.

### 4.5 Flow D — Sharing (FR-06, FR-09)

1. Only the owner sees Share; the dialog lists collaborators, their permissions, and add/change/revoke controls.
2. Add requires a valid email of an existing registered user and permission `viewer` or `editor`.
3. Unknown email → "No registered user with that email."; self → "You already own this document."; duplicate → "This person already has access." with guidance to change the role in the list.
4. Permission changes and revocations require confirmation for revocation; list refreshes after each mutation.
5. Recipients see the document under Shared with Me, can open it, and are subject to DB-enforced permissions.
6. Viewers cannot update content; editors cannot update title, delete, or mutate shares; unrelated users cannot see existence (404).
7. All share operations re-validate ownership server-side on every request.

**Acceptance:** Direct PostgREST calls using a viewer/editor/unrelated JWT respect the matrix in Section 9; UI hiding alone is never relied upon.

### 4.6 Flow E — Persistence (FR-08)

- Documents and shares are relational rows in Supabase PostgreSQL.
- Document content is `jsonb` TipTap JSON, validated before write.
- `created_at` is immutable; `updated_at` and `revision` are maintained by a database trigger.
- Deleting a document cascades its shares.
- Deleting a user cascades their owned documents and received shares (documented behavior).
- Refresh/reopen fidelity is verified by the smoke test, not assumed.

---

## 5. Nonfunctional Requirements

| ID | Requirement | Concrete target / verification |
|---|---|---|
| NFR-01 | Accessibility | Core flows keyboard operable; visible focus; labelled controls; dialog focus trap/return; save status announced via `aria-live="polite"`; WCAG AA contrast for text and essential UI; reduced-motion respected. Verified manually + axe spot check. |
| NFR-02 | Responsive | No horizontal overflow at 320 px, 375 px, 768 px, 1024 px, 1440 px; toolbar scrolls/wraps; sidebar becomes chips; dialog scrolls within viewport. |
| NFR-03 | Performance | Dashboard server render with one owned query + one shared query; no client data library; TipTap only on editor route; document lists capped at 100 per list (200 total) with a truncation notice; autosave payload limited by content validation. |
| NFR-04 | Security | RLS on all tables; explicit server authorization; Zod validation with `.strict()`; strict content whitelist; no HTML injection; no service-role key in runtime; same-origin checks on mutations; generic error bodies. See Section 16. |
| NFR-05 | Reliability | Optimistic concurrency via `revision`; autosave serialization (max one in-flight); retry policy; idempotent UI behavior for duplicate clicks; deterministic timestamps from DB. |
| NFR-06 | Maintainability | TypeScript strict; one repository layer; one validation module; semantic design tokens; no `any`; lint/typecheck/build pass. |
| NFR-07 | Observability | Server errors logged with request ID and error code only; no document content or tokens logged; user-facing messages never include stack traces or Supabase internals. |
| NFR-08 | Privacy | Profiles not broadly readable; recipient resolution occurs only inside the owner-checked `grant_document_share` RPC; no standalone email lookup; no content telemetry; no third-party analytics. |
| NFR-09 | Honesty | Docs and submission clearly mark what was verified, what is partial, and what is not implemented. No unverified claims. |

---

## 6. Technology Stack and Rationale

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router), latest stable major compatible with Vercel, pinned at install | Server Components for initial data, Route Handlers for testable JSON APIs, one deploy target. |
| UI runtime | React + React DOM matching Next's peer requirement | Required by Next. |
| Language | TypeScript 5.x, `strict: true`, ESLint `no-explicit-any` | Prevent drift between DB, API, and UI. |
| Styling | Tailwind CSS (v4 if supported by installed shadcn/ui; otherwise v3), CSS variables | Token-driven styling, no ad-hoc values. |
| Components | shadcn/ui (Radix primitives): button, input, dialog, alert-dialog, dropdown-menu, select, tooltip, skeleton, badge, separator, label, sonner | Accessible primitives without a component library runtime. |
| Icons | `lucide-react` | Consistent, labelled icons. |
| Editor | TipTap 3.x (`@tiptap/react`, `@tiptap/pm`, StarterKit, Underline, Link, Placeholder) | Structured JSON, controlled schema, no HTML serialization. |
| Database/Auth | Supabase PostgreSQL + Supabase Auth (`@supabase/supabase-js` 2.x, `@supabase/ssr`) | Managed Postgres, RLS, cookie sessions. |
| Authorization | PostgreSQL RLS + explicit repository checks | Defense in depth. |
| Validation | Zod (latest stable, pinned) | Shared, typed server validation. |
| Markdown parsing | `marked` lexer (pinned) + custom token→TipTap converter | Deterministic, testable, works server-side; no HTML execution. |
| Tests | Vitest, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@vitejs/plugin-react` | Fast unit tests; integration against local Supabase. |
| Deployment | Vercel (app) + Supabase (DB/Auth) | Assignment target. |

**Explicitly rejected:** ORM (unnecessary for three tables), separate API service, Redis/queues, Zustand/Redux (local component state + server data suffice), HTML sanitizers (we never render HTML), localStorage persistence (would fake persistence).

**Version policy:** At implementation time, install mutually compatible current stable versions and commit the lockfile. Verify Next.js's request-interception entry point name (`middleware.ts` vs `proxy.ts`) for the pinned major; wherever this spec says "middleware", use the framework's supported session-refresh entry point. Do not upgrade unrelated packages mid-task.

---

## 7. Architecture and Directory Structure

### 7.1 Architectural principles

1. **Server-first data access.** Dashboard and editor pages load data in Server Components through a server-only repository using a request-scoped, cookie-authenticated Supabase client.
2. **Browser mutations through Route Handlers.** Autosave, sharing, import, rename, delete, and create use `/api/*` JSON/multipart endpoints so contracts are explicit and testable. Auth uses Server Actions because they are form-centric.
3. **One authorization choke point.** `src/lib/auth/access.ts` resolves `owner | editor | viewer | none` from the database. Route handlers call it before mutations. RLS independently enforces the same matrix.
4. **One validation source.** Zod schemas in `src/lib/validation/` validate API bodies, TipTap JSON, titles, emails, and import metadata. Types are inferred from schemas.
5. **No service-role runtime.** The service-role key is used only by `scripts/seed-demo.mjs` and integration tests.
6. **Minimal abstraction.** Repository functions are thin typed wrappers. No generic CRUD base classes, no dependency injection container.
7. **Client state is local.** React state/refs for editor, dialogs, filters; `router.refresh()` after list-affecting mutations.

### 7.2 Directory tree

```text
.
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                    # Root layout, fonts, Toaster, metadata
│  │  ├─ globals.css                   # Design tokens + Tailwind layers
│  │  ├─ error.tsx                     # Route error boundary
│  │  ├─ not-found.tsx
│  │  ├─ (auth)/
│  │  │  ├─ layout.tsx                 # Centered auth shell (redirects signed-in users)
│  │  │  ├─ login/page.tsx
│  │  │  ├─ signup/page.tsx
│  │  │  └─ actions.ts                 # login, signup, signOut server actions
│  │  ├─ auth/callback/route.ts        # Supabase code exchange, safe `next`
│  │  ├─ (app)/
│  │  │  ├─ layout.tsx                 # requireUser + top nav shell
│  │  │  ├─ page.tsx                   # Dashboard (server data fetch)
│  │  │  ├─ loading.tsx                # Dashboard skeleton
│  │  │  ├─ error.tsx                  # Dashboard error + retry
│  │  │  └─ documents/[id]/
│  │  │     ├─ page.tsx                # Editor page (server fetch + role)
│  │  │     ├─ loading.tsx
│  │  │     └─ not-found.tsx           # not-found/forbidden-style panel; no existence leak
│  │  └─ api/
│  │     ├─ documents/route.ts         # GET list, POST create
│  │     ├─ documents/import/route.ts  # POST multipart import
│  │     └─ documents/[id]/
│  │        ├─ route.ts                # GET, PATCH, DELETE
│  │        └─ shares/
│  │           ├─ route.ts             # GET list (owner), POST grant
│  │           └─ [userId]/route.ts    # PATCH permission, DELETE revoke
│  ├─ components/
│  │  ├─ ui/                           # Generated shadcn primitives only
│  │  └─ layout/
│  │     ├─ top-nav.tsx
│  │     ├─ user-menu.tsx
│  │     └─ brand.tsx
│  ├─ features/
│  │  ├─ documents/
│  │  │  ├─ dashboard-view.tsx         # Client: filters, search, dialogs wiring
│  │  │  ├─ document-list.tsx
│  │  │  ├─ document-row.tsx
│  │  │  ├─ document-empty-state.tsx
│  │  │  ├─ rename-document-dialog.tsx
│  │  │  ├─ delete-document-dialog.tsx
│  │  │  ├─ create-document-button.tsx
│  │  │  └─ dashboard-skeleton.tsx
│  │  ├─ editor/
│  │  │  ├─ editor-loader.tsx          # "use client"; dynamic(ssr:false) boundary
│  │  │  ├─ document-editor.tsx        # "use client"; TipTap instance
│  │  │  ├─ editor-header.tsx
│  │  │  ├─ editor-toolbar.tsx
│  │  │  ├─ document-title-input.tsx
│  │  │  ├─ save-status.tsx
│  │  │  ├─ conflict-banner.tsx
│  │  │  └─ use-autosave.ts
│  │  ├─ sharing/
│  │  │  ├─ share-dialog.tsx
│  │  │  ├─ collaborator-list.tsx
│  │  │  └─ permission-select.tsx
│  │  └─ import/
│  │     ├─ import-dialog.tsx
│  │     └─ use-file-validation.ts
│  ├─ lib/
│  │  ├─ supabase/
│  │  │  ├─ browser.ts                # createBrowserClient
│  │  │  ├─ server.ts                 # createServerClient per request (cookies)
│  │  │  └─ middleware.ts             # refreshSession(request)
│  │  ├─ auth/
│  │  │  ├─ require-user.ts            # requireUser(), requireApiUser()
│  │  │  ├─ access.ts                  # resolveDocumentAccess()
│  │  │  └─ safe-redirect.ts
│  │  ├─ db/
│  │  │  ├─ documents.ts               # list/get/create/update/delete
│  │  │  └─ shares.ts                  # list/grant-by-email/change/revoke
│  │  ├─ validation/
│  │  │  ├─ common.ts                  # uuid, email, pagination
│  │  │  ├─ documents.ts               # create/update/list schemas
│  │  │  ├─ shares.ts                  # grant/change schemas
│  │  │  ├─ tiptap.ts                  # recursive content whitelist
│  │  │  └─ import.ts                  # file metadata + conversion input
│  │  ├─ import/
│  │  │  ├─ parse-file.ts              # extension/size/UTF-8/NUL checks
│  │  │  └─ markdown-to-tiptap.ts      # marked lexer → whitelisted JSON
│  │  ├─ api/
│  │  │  ├─ responses.ts               # ok(), created(), noContent(), fail()
│  │  │  ├─ errors.ts                  # AppError + code→status map
│  │  │  └─ require-same-origin.ts
│  │  ├─ editor/
│  │  │  ├─ extensions.ts              # TipTap extension set (shared)
│  │  │  └─ default-content.ts         # empty doc JSON
│  │  ├─ dates.ts                      # local formatting/relative time
│  │  └─ utils.ts                      # cn(), sanitizeFilename, truncate
│  ├─ types/
│  │  ├─ database.ts                   # generated Supabase types (committed)
│  │  ├─ domain.ts                     # DocumentDTO, Role, Collaborator
│  │  └─ api.ts                        # response envelopes
│  ├─ middleware.ts                    # session refresh (or proxy.ts for pinned major)
│  └─ test/setup.ts
├─ supabase/
│  ├─ config.toml
│  └─ migrations/
│     ├─ <ts>_01_schema.sql
│     ├─ <ts>_02_functions_triggers.sql
│     └─ <ts>_03_rls_grants.sql
├─ scripts/
│  └─ seed-demo.mjs
├─ tests/
│  ├─ unit/
│  │  ├─ validation-content.test.ts
│  │  ├─ import-validation.test.ts
│  │  ├─ markdown-to-tiptap.test.ts
│  │  ├─ autosave-reducer.test.ts
│  │  └─ access-role.test.ts
│  └─ integration/
│     ├─ helpers.ts                    # service-role admin client, test users (tests only)
│     └─ rls.test.ts
├─ docs/
│  ├─ screenshot-dashboard.png
│  ├─ screenshot-editor.png
│  ├─ screenshot-share.png
│  └─ demo.gif
├─ public/
├─ .env.example
├─ .env.test.example
├─ .gitignore
├─ components.json
├─ eslint.config.mjs
├─ next.config.ts
├─ package.json
├─ package-lock.json
├─ postcss.config.mjs
├─ tsconfig.json
├─ vitest.config.ts
├─ vitest.integration.config.ts
├─ README.md
├─ ARCHITECTURE.md
├─ AI_WORKFLOW.md
├─ SUBMISSION.md
├─ WALKTHROUGH.txt
└─ PROJECT_SPEC.md
```

### 7.3 Module responsibilities and boundaries

- `app/**`: routing, layouts, auth guards, page-level data loading, metadata. No direct SQL.
- `features/**`: interactive UI. May fetch `/api/*`; must not instantiate Supabase or know RLS details.
- `lib/db/**`: server-only. Accepts an authenticated Supabase client and verified `userId`; returns domain DTOs; never accepts `ownerId` from request payloads.
- `lib/validation/**`: pure, isomorphic; no DB imports.
- `lib/import/**`: pure, server-safe; no DOM APIs.
- `lib/supabase/server.ts`: one client per request; `server-only` import guard.
- `types/database.ts`: generated from local schema via Supabase CLI; commit it.

### 7.4 Data flow

```text
Browser (Server Component HTML + client islands)
  ├─ initial read: RSC → requireUser → repository → Supabase (user JWT/RLS)
  └─ mutations: client fetch → Route Handler
        → same-origin check → requireApiUser (auth.getUser)
        → Zod parse (strict)
        → resolveDocumentAccess / owner check
        → repository → Supabase (user JWT/RLS) → DB trigger (revision/updated_at/immutability)
        → JSON envelope → client state + router.refresh()
```

---

## 8. Database Schema and Relationships

### 8.1 Entity relationship

```text
auth.users (Supabase managed)
  1 ── 1 public.profiles           (id, synced from auth.users)
  1 ── * public.documents          (owner_id)
  1 ── * public.document_shares    (user_id / recipient)
public.documents
  1 ── * public.document_shares    (document_id, ON DELETE CASCADE)
```

### 8.2 `public.profiles`

Used only by the owner-checked `grant_document_share` RPC to resolve a recipient email, without exposing the auth schema or requiring a service-role runtime call.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, FK `auth.users(id) ON DELETE CASCADE` |
| `email` | `text` | NOT NULL, non-blank; unique index on `lower(email)` |
| `display_name` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

- Rows are created/updated only by security-definer triggers on `auth.users`; clients have SELECT on their own row only.
- Emails are stored lowercase. Email changes in `auth.users` sync via trigger.

### 8.3 `public.documents`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` |
| `title` | `text` | NOT NULL, `char_length(btrim(title)) BETWEEN 1 AND 200` |
| `content` | `jsonb` | NOT NULL DEFAULT empty TipTap doc; JSON object; serialized size ≤ 2 MiB |
| `owner_id` | `uuid` | NOT NULL, FK `auth.users(id) ON DELETE CASCADE` |
| `revision` | `integer` | NOT NULL DEFAULT 1, `> 0`; incremented by trigger |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()`; set by trigger |

Indexes:
- `(owner_id, updated_at DESC)` for "My Documents".
- Composite access paths are covered by PK/unique indexes below.

### 8.4 `public.document_shares`

| Column | Type | Constraints |
|---|---|---|
| `document_id` | `uuid` | NOT NULL, FK `documents(id) ON DELETE CASCADE` |
| `user_id` | `uuid` | NOT NULL, FK `auth.users(id) ON DELETE CASCADE` |
| `permission` | `text` | NOT NULL, CHECK IN (`'viewer'`, `'editor'`) |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

- PRIMARY KEY `(document_id, user_id)` — prevents duplicate grants.
- Index `(user_id, created_at DESC)` for "Shared with Me".
- Index `(document_id)` for collaborator listing.
- Self-shares are blocked by RLS `WITH CHECK`, re-checked inside `grant_document_share`, and re-checked by the server; a missing document is rejected by the foreign key.

### 8.5 Deletion and timestamp behavior

- Delete document (owner only) → shares cascade.
- Delete user → owned documents and received/created shares cascade. No ownership transfer.
- `documents.updated_at` and `revision` are set only by the `BEFORE UPDATE` trigger.
- `documents.created_at` and `owner_id` are immutable via trigger + column privileges.
- `document_shares.created_at` is set once by default; no update timestamp is required because only `permission` is mutable.
- Adding, changing, or revoking a share does **not** change `documents.updated_at`; "updated" reflects content/title edits. Share recency is tracked by `document_shares.created_at`.

### 8.6 Migration SQL (authoritative behavior)

Three ordered migrations. The SQL below is the required behavior; exact formatting may differ.

**`01_schema.sql`**

```sql
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
```

**`02_functions_triggers.sql`**

```sql
-- Access helpers live in `private`, which PostgREST does not expose.
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

-- Keep profiles in sync with auth.users.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null then
    return new; -- email/password and OAuth flows only in scope
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

-- Owner-only collaborator directory (avoids broad profile reads).
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

-- Owner-only atomic grant-by-email. No standalone email lookup exists.
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
```

**`03_rls_grants.sql`**

```sql
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

-- Table privileges: RLS is not a substitute for least privilege.
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

-- Private helpers: executable by signed-in users for policy evaluation only.
grant usage on schema private to authenticated;
revoke all on schema private from public, anon;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Public RPCs: signed-in users only; grant_document_share re-checks ownership.
revoke all on function public.list_document_collaborators(uuid) from public, anon;
revoke all on function public.grant_document_share(uuid, text, text) from public, anon;
grant execute on function public.list_document_collaborators(uuid) to authenticated;
grant execute on function public.grant_document_share(uuid, text, text) to authenticated;

-- Refresh PostgREST's schema cache after adding RPCs.
notify pgrst, 'reload schema';
```

### 8.7 RLS pitfalls explicitly addressed

1. **No recursive policies.** Policies never subquery a table whose policy subqueries the same table. Access checks go through `SECURITY DEFINER` helpers in the unexposed `private` schema.
2. **Safe definer config.** Every helper/trigger is `SECURITY DEFINER` with `SET search_path = ''` and fully schema-qualified references. Execute is revoked from `PUBLIC`/`anon` and granted to `authenticated` only.
3. **Correct USING vs WITH CHECK.** `USING` gates which existing rows may be updated/deleted; `WITH CHECK` validates the new row. Both are set for updates.
4. **Column-level privileges complement RLS.** RLS cannot distinguish "content" from "title". `UPDATE (title, content)` is granted, `owner_id`/`revision`/`updated_at` are not; a trigger enforces title ownership and owner immutability.
5. **Authorization uses `auth.uid()`**, never `user_metadata`, request headers, or client-supplied owner IDs.
6. **Select after write.** Supabase mutations that return rows also need SELECT permission; all mutating queries `.select()` only rows the caller may read.
7. **Service role bypasses RLS.** It is excluded from runtime app code; only seed/tests use it.
8. **Indexes support policy predicates**: PK `document_shares(document_id, user_id)`, index `document_shares(user_id, created_at)`, index `document_shares(document_id)`, and index `documents(owner_id, updated_at)`.
9. **No anon policies or grants**, so anonymous REST access returns no rows and cannot write.
10. **`(select auth.uid())`** is used so Postgres can treat it as an initplan rather than re-evaluating per row.

### 8.8 Supabase type generation

After migrations: `npx supabase gen types typescript --local > src/types/database.ts`. Regenerate after schema changes and commit. Repository code uses the generated `Database` type plus narrow domain DTOs.

### 8.9 Share-by-email privacy (audit correction)

- There is no public `lookup_user_by_email` RPC. Standalone lookup would let any signed-in user probe whether arbitrary emails are registered.
- `grant_document_share` checks ownership before resolving the email, resolves and inserts in one transaction, and returns only the newly granted collaborator.
- This removes the global lookup and the lookup/insert race, and prevents non-owners from probing a specific document. Any signed-in user can create a document and act as its owner, so this is not complete enumeration prevention: an owner can still test one email per grant attempt. Full prevention would require invitations or generic responses (which conflict with the required clear unknown-user error) and rate limiting; those are out of scope. There is no bulk lookup, and rate limiting remains deferred.
- SQLSTATE mapping: `42501` → 403; `P0002` → 404 `USER_NOT_FOUND`; `P0001` → 422 `SELF_SHARE`; `23505` → 409 `ALREADY_SHARED`; `22023`/`23514` → 422 `VALIDATION_ERROR`.

---

## 9. Authentication and Authorization Matrix

### 9.1 Authentication

- Supabase Auth, email + password only (OAuth not required).
- `@supabase/ssr` cookie-based sessions; `createBrowserClient` and per-request `createServerClient`.
- The session-refresh entry point refreshes expiring tokens on navigation and API calls.
- Server identity is obtained with `supabase.auth.getUser()` (validates the JWT with Supabase Auth), **never** `getSession()` or a manually decoded token.
- Signup collects email, password, optional display name; `emailRedirectTo` points to `${NEXT_PUBLIC_SITE_URL}/auth/callback`.
- `/auth/callback` exchanges the code, validates `next` as a same-origin relative path, and redirects.
- Protected layouts also guard (middleware is not the only guard). Anonymous page request → `/login?next=<same-origin path>`.
- Sign-out is a Server Action that clears cookies and redirects to `/login`.
- Login errors are generic ("Invalid email or password") to avoid account enumeration.
- Password reset is out of scope; no dead "Forgot password" link is rendered.

### 9.2 Role resolution

`resolveDocumentAccess(documentId, userId)`:
1. Read the document via the user-scoped client (RLS returns it only if `owner` or shared).
2. If absent → `none`.
3. If `document.owner_id === userId` → `owner`.
4. Else read the caller's own share row (`document_id`, `user_id = userId`) → `editor` or `viewer`.
5. If a share is missing but the document was readable (race) → `none`.

`none` must be treated as **404** for document reads and writes to avoid existence disclosure. A user with `viewer`/`editor` access who attempts an owner-only or edit operation receives **403**.

### 9.3 Authorization matrix

| Operation | Anonymous | Unrelated authenticated | Viewer | Editor | Owner |
|---|---|---|---|---|---|
| See document in dashboard | No | No | Shared list | Shared list | My Documents |
| Read title/content | No | No (404) | Yes | Yes | Yes |
| Read collaborator list | No | No | No | No | Yes |
| Update content | No | No | No (403) | Yes | Yes |
| Update title (rename) | No | No | No | No | Yes |
| Delete document | No | No | No | No | Yes |
| Grant share | No | No | No | No | Yes |
| Change permission | No | No | No | No | Yes |
| Revoke share | No | No | No | No | Yes |
| See own share record | No | No | Yes | Yes | N/A |
| Direct PostgREST writes | No (no grants/policies) | No | No | Content only | Title/content/delete/shares |

`owner > editor > viewer` is a strict hierarchy for reads; write privileges are not inherited beyond the table above.

### 9.4 Owner integrity

- Create payloads use `.strict()` schemas with **no** `ownerId` field. Extra keys are rejected.
- The repository sets `owner_id = verifiedUser.id` from `getUser()`.
- DB insert policy requires `owner_id = auth.uid()`.
- DB trigger rejects any attempt to change `owner_id`; column privileges do not grant `owner_id` updates.
- Sharing cannot target the owner/self (RLS + owner-only `grant_document_share` + server check).

---

## 10. API and Validation Contracts

### 10.1 Conventions

- Base path `/api`; JSON unless noted; UTF-8.
- Success: `200`/`201`/`204` with `{ "data": ... }` where a body exists.
- Error: appropriate 4xx/5xx with:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Human-readable summary.", "fields": { "title": "..." } } }
  ```
  `fields` and `details` are optional (`details` carries non-sensitive context such as `{ currentRevision, updatedAt }` for `CONFLICT`). No stack traces, SQL, Supabase error text, or secrets.
- Auth: cookie session. Every handler calls `requireApiUser()` → `401 UNAUTHENTICATED` when absent.
- CSRF: mutating handlers check same-origin (`Origin` host matches request host when present, and `Sec-Fetch-Site` is not `cross-site`); mismatch → `403 FORBIDDEN`. Cookies are `SameSite=Lax`.
- Content-Type: JSON handlers require `application/json` (→ `415 UNSUPPORTED_MEDIA_TYPE`); import requires `multipart/form-data`.
- Request IDs: generated per request and included in server logs; not required in responses.
- Zod: `.strict()` on all object schemas; unknown keys fail validation. Manual malformed JSON → `400 INVALID_JSON`; schema failure → `422 VALIDATION_ERROR`.
- UUID path params validated; invalid → `422 VALIDATION_ERROR` (no DB query).
- Ownership checks occur before expensive work; 404 vs 403 rules from Section 9.2.
- Rate limiting is not implemented; documented as a limitation.

### 10.2 Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Authenticated but not allowed (or cross-origin mutation) |
| `NOT_FOUND` | 404 | Document/share/route not found or not visible |
| `VALIDATION_ERROR` | 422 | Schema/semantic validation failed |
| `INVALID_JSON` | 400 | Body is not valid JSON |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Wrong content type |
| `CONFLICT` | 409 | Revision conflict (stale `baseRevision`) |
| `ALREADY_SHARED` | 409 | Recipient already has a grant |
| `USER_NOT_FOUND` | 404 | Email is not a registered user |
| `SELF_SHARE` | 422 | Owner cannot share with self |
| `FILE_TOO_LARGE` | 413 | Import file > 1 MiB |
| `UNSUPPORTED_FILE` | 415 | Extension not `.txt`/`.md` |
| `EMPTY_FILE` | 422 | No readable text |
| `INVALID_ENCODING` | 422 | Not valid UTF-8 / binary content |
| `PARSE_ERROR` | 422 | Markdown/text conversion failed |
| `INTERNAL_ERROR` | 500 | Unexpected server failure |

### 10.3 Shared Zod contracts

```ts
// common
const uuidSchema = z.string().uuid();
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const titleSchema = z.string().trim().min(1).max(200);
const permissionSchema = z.enum(['viewer', 'editor']);

// TipTap content: see Section 10.6
```

### 10.4 Endpoints

#### GET `/api/documents`

- **Auth:** required.
- **Authz:** returns only owned + shared-with-me via RLS; no parameters can widen scope.
- **Input:** none.
- **Output 200:**
  ```json
  {
    "data": {
      "owned": [DocumentSummary],
      "shared": [DocumentSummary],
      "truncated": { "owned": false, "shared": false }
    }
  }
  ```
- **Rules:** each list is ordered by document `updated_at` DESC and capped at 100 per list (fetch 101 per list to set its `truncated` flag). Owned = `documents` filtered by `owner_id`; shared = `documents` with an inner join on the caller's `document_shares` row, ordered by document `updated_at` (not share creation). `DocumentSummary` = `{ id, title, revision, createdAt, updatedAt, accessRole }`; for shared rows `accessRole` is the share permission.
- **Notes:** the dashboard Server Component uses the same repository directly; this endpoint exists for contract completeness and tests.
- **Errors:** 401, 500.

#### POST `/api/documents`

- **Auth:** required.
- **Input:** `{ "title"?: string }` (strict). Create uses a dedicated schema (`title: string.trim().max(200).optional()`) so missing/blank title becomes the default `"Untitled document"`; the stricter 1–200 title schema applies to renames.
- **Output 201:** `{ "data": { document: Document } }` where `Document` includes `content` and `revision`.
- **Behavior:** inserts with empty doc JSON and `owner_id = user.id`.
- **Errors:** 401, 422, 500.

#### GET `/api/documents/:id`

- **Auth:** required. **Authz:** `owner|editor|viewer`.
- **Output 200:** `{ "data": { "document": Document } }`; `Document.accessRole` is one of `owner|editor|viewer`.
- **Errors:** 401; 404 for none (including unrelated users and unknown IDs); 500.

#### PATCH `/api/documents/:id`

- **Auth:** required.
- **Input (strict):**
  ```json
  { "baseRevision": 3, "title"?: "New title", "content"?: { TipTapDoc } }
  ```
  At least one of `title`/`content`; `baseRevision` is a positive integer.
- **Authz:** `title` requires owner; `content` requires owner or editor. Viewer/unrelated rejected.
- **Validation:** title 1–200 after trim; content whitelist/size limits (10.6).
- **Behavior:** conditional update `WHERE id = ? AND revision = baseRevision`; DB trigger increments `revision` and `updated_at`.
- **Output 200:** `{ "data": { "document": Document } }`.
- **Errors:** 401, 403 (known doc, insufficient role), 404, 409 `CONFLICT` with `details: { currentRevision, updatedAt }`, 422, 500.
- **Conflict rule:** never write when 0 rows matched due to revision mismatch; distinguish 404 vs 409 with a follow-up visibility read.
- **Note:** autosave sends owner title+content or editor content-only, always with `baseRevision`.

#### DELETE `/api/documents/:id`

- **Auth:** owner only. Viewers/editors → 403; unrelated/unknown → 404.
- **Output:** 204. Cascades shares.
- **Errors:** 401, 403, 404, 500.

**Share endpoints:** resolve document visibility first (none → 404; known non-owner → 403), then require owner; the RPC/repository enforces the same.

#### GET `/api/documents/:id/shares`

- **Auth:** owner only.
- **Output 200:** `{ "data": { "collaborators": [{ userId, email, displayName, permission, createdAt }] } }`.
- **Implementation:** resolve visibility first (none → 404, known non-owner → 403), then `public.list_document_collaborators(id)`; RPC `42501` maps to 403.
- **Errors:** 401, 403, 404, 500.

#### POST `/api/documents/:id/shares`

- **Auth:** owner only.
- **Input (strict):** `{ "email": string, "permission": "viewer" | "editor" }`.
- **Behavior:** normalize/validate email and permission; call `public.grant_document_share(id, email, permission)`. The RPC re-checks ownership, resolves the email, rejects self, inserts atomically, and returns the collaborator. No standalone email lookup is exposed.
- **Output 201:** `{ "data": { "collaborator": Collaborator } }`.
- **Errors:** 401, 403, 404 (`USER_NOT_FOUND` / doc), 409 `ALREADY_SHARED`, 422 `SELF_SHARE`/`VALIDATION_ERROR`, 500. Map SQLSTATE per Section 8.9.

#### PATCH `/api/documents/:id/shares/:userId`

- **Auth:** owner only. **Input:** `{ "permission": "viewer" | "editor" }`.
- **Behavior:** update `permission`; if unchanged → 200 idempotent; missing grant → 404; self/owner target → 422 `SELF_SHARE`.
- **Output 200:** `{ "data": { "collaborator": Collaborator } }`.
- **Errors:** 401, 403, 404, 422, 500.

#### DELETE `/api/documents/:id/shares/:userId`

- **Auth:** owner only.
- **Behavior:** delete grant; missing → 404; success → 204.
- **Errors:** 401, 403, 404, 500.

#### POST `/api/documents/import`

- **Auth:** required (creates owned document).
- **Input:** `multipart/form-data` with exactly one `file` field; filename required.
- **Validation order:** content type multipart → `Content-Length` sanity → extension `.txt`/`.md` (case-insensitive) → `file.size ≤ 1,048,576` → strict UTF-8 decode → no NUL → non-empty after trim → convert.
- **Output 201:** `{ "data": { "document": Document } }`.
- **Errors:** 401, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE`/`UNSUPPORTED_MEDIA_TYPE`, 422 `EMPTY_FILE`/`INVALID_ENCODING`/`PARSE_ERROR`/`VALIDATION_ERROR`, 500.
- **Security:** bytes are never rendered as HTML; conversion emits whitelisted JSON only. Request bodies above ~4.5 MB are rejected before parsing via `Content-Length` when present.

### 10.5 Response DTOs

```ts
type AccessRole = 'owner' | 'editor' | 'viewer';

interface DocumentSummary {
  id: string;
  title: string;
  revision: number;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
  accessRole: AccessRole; // shared rows expose viewer/editor
}

interface Document extends DocumentSummary {
  content: TiptapDoc;
}

interface DocumentList {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
  truncated: { owned: boolean; shared: boolean };
}

interface Collaborator {
  userId: string;
  email: string;
  displayName: string | null;
  permission: 'viewer' | 'editor';
  createdAt: string;
}
```

Timestamps are serialized as ISO 8601 UTC strings from Postgres.

### 10.6 TipTap content validation

Allowed schema (server rejects everything else):

- **Top node:** `doc` with `content` array.
- **Block nodes:** `paragraph`, `heading` (`attrs.level` 1–3), `bulletList`, `orderedList` (`attrs.start` 1–9999 optional), `listItem`, `hardBreak`.
- **Inline:** `text` (non-empty string).
- **Marks:** `bold`, `italic`, `underline`, `link` (`attrs.href` only; `target`/`rel` may be normalized server-side).
- **Link href:** max 2048 chars; protocol must be `http:`, `https:`, or `mailto:`. No `javascript:`, `data:`, or relative/protocol-relative URLs. PATCH rejects invalid content with 422; the import converter strips an invalid link mark and keeps its text.
- **No** images, tables, code blocks, blockquotes, raw HTML, iframes, or unknown attributes.
- **Limits:** serialized JSON ≤ 2,097,152 bytes; total text length ≤ 500,000 chars; node count ≤ 10,000; nesting depth ≤ 12. Exceeding → 422.
- Recursive Zod schema with manual depth guard; unknown keys rejected; unknown `type`/`mark` rejected.
- Client-side editor uses the same whitelist; server validation is authoritative.
- TipTap is configured with Heading limited to `levels: [1, 2, 3]`, Bold/Italic/Underline/BulletList/OrderedList, undo/redo (History in TipTap 2, UndoRedo in TipTap 3), Link with `openOnClick: false` plus a protocol whitelist, and Placeholder ("Start writing…"). If the installed StarterKit version already bundles Underline, Link, and/or Placeholder, disable those bundled variants before adding the explicit extensions to avoid duplicate-extension warnings. Links are styled but navigation while editing is disabled.

Example valid content:

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Summary" }] },
    { "type": "paragraph", "content": [
      { "type": "text", "text": "This is " },
      { "type": "text", "marks": [{ "type": "bold" }], "text": "important" },
      { "type": "text", "text": " and " },
      { "type": "text", "marks": [{ "type": "italic" }], "text": "subtle" },
      { "type": "text", "text": "." }
    ]},
    { "type": "bulletList", "content": [
      { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "First" }] }] }
    ]}
  ]
}
```

### 10.7 Authorization consistency

- Route handlers resolve role via `resolveDocumentAccess` and enforce operation-specific rules **before** calling the repository.
- The same rules exist in RLS/triggers. A direct PostgREST call cannot exceed the matrix.
- Field-level rules (title vs content) are enforced in three places: UI affordance, handler check, and DB trigger/column privileges.
- No endpoint accepts `owner_id`, `revision` (except as `baseRevision` in the predicate), `created_at`, or `updated_at` as writable fields.

---

## 11. UI/UX Design System

### 11.1 Visual direction

- Calm, typography-led, warm-neutral surfaces; white writing canvas; restrained indigo accent.
- Google Docs usability (obvious formatting, focused canvas) with Linear's restraint (few borders, small type scale, precise spacing).
- No glassmorphism, large hero sections, decorative gradients, stock illustrations, or nested card stacks.
- Light theme only; `color-scheme: light`. Dark mode is explicitly deferred (Section 20).
- The editor is the visual centerpiece: generous whitespace, readable measure, quiet chrome.

### 11.2 Design tokens

All colors are CSS custom properties in `src/app/globals.css` and mapped to Tailwind/shadcn tokens. Components must use tokens (`bg-background`, `text-muted-foreground`, `border-border`), never raw hex values.

**Color**

| Token | Value | Usage |
|---|---|---|
| `--background` | `#FAF9F7` | App background |
| `--foreground` | `#1B1A17` | Primary text |
| `--card` | `#FFFFFF` | Cards, editor canvas, dialogs |
| `--card-foreground` | `#1B1A17` | Text on card |
| `--popover` | `#FFFFFF` | Menus/popovers |
| `--primary` | `#4F46E5` | Primary buttons, links, active nav |
| `--primary-hover` | `#4338CA` | Primary hover/active |
| `--primary-foreground` | `#FFFFFF` | Text on primary |
| `--primary-soft` | `#EEF0FF` | Selected nav, owner badge, active toolbar |
| `--secondary` | `#F1EEE8` | Secondary buttons |
| `--secondary-foreground` | `#2A2824` | Text on secondary |
| `--muted` | `#F4F1EB` | Sidebar, subtle surfaces |
| `--muted-foreground` | `#5F5B53` | Secondary text (AA on background) |
| `--subtle-foreground` | `#79746A` | Non-essential/decorative only |
| `--accent` | `#EDEAE3` | Hover surface |
| `--border` | `#E5E0D6` | Default borders |
| `--input` | `#DDD7CB` | Input borders |
| `--ring` | `#6366F1` | Focus ring |
| `--destructive` | `#B42318` | Destructive actions |
| `--destructive-foreground` | `#FFFFFF` | Text on destructive |
| `--destructive-soft` | `#FEE4E2` | Destructive hover/badge |
| `--success` | `#166534` | Saved status |
| `--success-soft` | `#DCFCE7` | Success surfaces |
| `--warning` | `#92400E` | Conflict warning |
| `--warning-soft` | `#FEF3C7` | Warning banner |
| `--selection` | `#DEDBFF` | Text selection in editor |
| `--overlay` | `rgba(27,26,23,0.40)` | Dialog overlay |

Contrast rule: body/muted text on `--background` and `--card` must be ≥ 4.5:1; primary white-on-indigo is ≥ 4.5:1; never use `--subtle-foreground` for essential labels.

**Typography**

- Family: Inter via `next/font/google`, weights 400/500/600, `display: swap`, `--font-sans`; system fallback. Editor uses the same family at a larger size for focus.
- Feature settings: `"cv11", "ss01"` optional; no serif display font.
- Headings use `letter-spacing: -0.011em`.

| Style | Size / line-height | Weight | Usage |
|---|---|---|---|
| Display | 30 / 38 | 600 | Auth/dashboard page title on desktop |
| H1 | 24 / 32 | 600 | Page title mobile/dashboard |
| H2 | 20 / 28 | 600 | Section titles |
| H3 | 16 / 24 | 600 | Card/row titles |
| Body | 14 / 22 | 400 | UI text |
| Body large | 16 / 26 | 400 | Auth labels, dialog copy |
| Small | 13 / 20 | 400 | Metadata |
| Caption | 12 / 18 | 500 | Badges, timestamps |
| Editor body | 17 / 29.75 (1.75) | 400 | Writing canvas |
| Editor H1 | 30 / 38 | 600 | In-document heading 1 |
| Editor H2 | 24 / 32 | 600 | In-document heading 2 |
| Editor H3 | 20 / 28 | 600 | In-document heading 3 |

**Spacing**

4 px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Rules:
- Page horizontal padding: 16 px mobile, 24 px tablet, 32 px desktop.
- Stack default: 12 px between related controls, 24 px between sections.
- Editor canvas text measure: 720–760 px max; paragraph spacing 12 px; list indent 24 px.
- Sidebar width 248 px; top nav 56 px; toolbar 44 px; row height 64 px.

**Radii**

`6px` small controls/chips, `8px` buttons/inputs, `12px` cards/canvas, `16px` dialogs, `9999px` pills/avatars.

**Shadows**

| Token | Value |
|---|---|
| `shadow-xs` | `0 1px 2px rgba(27,26,23,0.06)` |
| `shadow-sm` | `0 1px 3px rgba(27,26,23,0.08), 0 1px 2px rgba(27,26,23,0.04)` |
| `shadow-md` | `0 4px 12px rgba(27,26,23,0.08), 0 2px 4px rgba(27,26,23,0.04)` |
| `shadow-dialog` | `0 16px 40px rgba(27,26,23,0.16), 0 4px 12px rgba(27,26,23,0.08)` |

**Focus and motion**

- Focus ring: `outline: 2px solid var(--ring); outline-offset: 2px` on `:focus-visible`; never remove focus styles; focus ring must remain visible on cards and colored buttons.
- Motion: 150 ms ease-out for hover/press; 200 ms for dialog/menu entrance; no looping animation.
- `@media (prefers-reduced-motion: reduce)`: set transitions/animations to 0.01 ms and avoid transform-based entrances.

### 11.3 Component primitives

| Component | Spec |
|---|---|
| Button | Heights 36 (sm), 40 (md); primary = indigo fill; secondary = white + border; ghost = transparent hover `--accent`; destructive = red text/soft bg in dialogs. Icon-only buttons are 36×36 with `aria-label` and tooltip. Disabled at 50% opacity, no pointer events. Loading shows spinner + preserves width, `aria-busy`. |
| Input | 40 px; 1 px `--input`; radius 8; placeholder `--subtle-foreground`; focus ring; error border `--destructive` plus inline text with `aria-describedby`; `maxLength` surfaced with counter only near limit. |
| Select | shadcn Select; 36–40 px; keyboard typeahead; labelled by visible `Label` or `aria-label`. |
| Dialog | Radix Dialog; overlay `--overlay`; card radius 16; `shadow-dialog`; max-height `calc(100dvh - 32px)` with internal scroll; title/description; focus trap; Esc closes when not submitting; returns focus to trigger. |
| AlertDialog | Used for delete/revoke; destructive action separated and labelled explicitly. |
| Badge | Pill, 12 px/500; Owner = indigo soft; Editor = success soft; Viewer = neutral; "View only" = neutral with lock icon. |
| Tooltip | Radix Tooltip, 300 ms delay; used for icon-only controls; never the only accessible name. |
| Toast | Sonner, bottom-right desktop / top-center mobile; max 4 s; success and error variants; no toast containing document content. |
| Skeleton | `--muted` blocks with radius 6; no shimmer for reduced motion. |
| Empty state | Lucide icon in 40 px soft circle, 16 px title, 13 px muted copy, optional primary/secondary actions; max-width 360; centered. |

### 11.4 Interaction quality

- Hover: background/border shift only; no layout shift.
- Active/pressed: slightly darker token; toolbar `aria-pressed` persists for active marks.
- Focus: visible ring on every interactive element, including rows and menu items.
- Disabled: 50% opacity, `aria-disabled`, no action.
- Loading: inline spinner or skeleton; buttons disabled while pending to prevent duplicate submissions.
- Success: toast + durable UI change (status, list refresh). Error: inline message near the cause, actionable retry where possible.
- Destructive: confirmation dialog with the object name; destructive button is not the default focus.
- No fake controls, placeholder `href="#"`, dead buttons, or controls that silently do nothing. Unimplemented features are not rendered.
- Info conveyed by badge/status also has text or an icon + text; never color alone.

---

## 12. Screen and Component Specifications

### 12.1 Authentication — `/login`, `/signup`

**Hierarchy**

```text
(auth)/layout.tsx
└─ main (min-h-dvh, centered, bg-background)
   ├─ Brand (icon + "Ajaia Docs")
   ├─ Card (max-w-[400px], p-8, border, shadow-sm)
   │  ├─ h1 ("Welcome back" / "Create your account")
   │  ├─ p (muted supporting copy)
   │  ├─ form (Server Action)
   │  │  ├─ Label + Input (email, autocomplete="email")
   │  │  ├─ Label + Input (password, autocomplete="current-password" | "new-password")
   │  │  ├─ [signup only] Label + Input (display name, optional)
   │  │  ├─ Inline error alert (aria-live)
   │  │  └─ Submit Button (full width, loading)
   │  └─ p ("New here? Create an account" / "Already have an account? Sign in")
```

**Behavior**

- Client-side: required fields, email shape, password ≥ 8 chars; server re-validates.
- Pending: button "Signing in…"/"Creating account…", disabled; inputs disabled.
- Login failure: generic "Invalid email or password."
- Signup success with confirmation enabled: show a neutral panel "Check your email to confirm your account." No fake auto-login. If confirmations are disabled (demo), redirect to `/`.
- Signed-in users visiting auth pages are redirected to `/`.
- `next` is read from search params server-side, validated as a local absolute path (starts with `/`, not `//`), default `/`.
- No password-reset link.

**Responsive:** card is full-width minus 32 px below 480 px; no page scroll at 320 px.

**Acceptance:** keyboard-only sign-in works; errors announced; no account enumeration on login; no access to `/` while signed out.

### 12.2 Top navigation (app shell)

```text
TopNav (sticky, h-14, border-b, bg-background/backdrop)
├─ Brand (link to /)
├─ (desktop) subtle product label "Docs"
└─ UserMenu (right)
   ├─ avatar initial (32 px, indigo-soft)
   ├─ email (truncated, hidden < md)
   └─ DropdownMenu: "Signed in as {email}", separator, "Sign out"
```

- Height 56 px; horizontal padding matches page padding; `z-30`.
- User menu trigger has `aria-label="Account menu"` and visible focus.
- Sign out submits a Server Action; pending state disables the item.
- No notifications/settings icons that do nothing.

### 12.3 Dashboard — `/`

**Hierarchy**

```text
(app)/layout.tsx
├─ TopNav
└─ div (mx-auto max-w-[1120px] px-4/6/8)
   └─ dashboard page
      ├─ header (mt-8)
      │  ├─ div: h1 "Documents" + p "{n} recent documents" (append "+" when truncated)
      │  └─ actions: Import (secondary), New document (primary)
      ├─ toolbar row (mt-6): Search input (icon, max-w 320)
      └─ layout (mt-6, lg:grid lg:grid-cols-[248px_1fr] lg:gap-8)
         ├─ DashboardSidebar (desktop only)
         │  └─ nav: All Documents, My Documents, Shared with Me (counts)
         └─ main
            ├─ (mobile) FilterChips: All / Mine / Shared
            ├─ section "My Documents" (when filter allows)
            │  ├─ h2 + count
            │  └─ DocumentList → DocumentRow[]
            ├─ section "Shared with me" (when filter allows)
            │  ├─ h2 + count
            │  └─ DocumentList → DocumentRow[]
            └─ EmptyState / FilteredEmptyState / ErrorState / Skeleton
```

**DocumentRow**

- 64 px min-height. The row is a non-interactive container. The title/meta area is a single link (or `::after` overlay on the link) for opening; the actions menu is a **sibling** button, never nested inside the link (no nested interactive elements).
- Left: 20 px document icon in a 36 px soft square (optional); title 16/24 weight 500, truncated to one line; meta line: `<time>` updated, dot, badge (`Owner` / `Editor` / `Viewer`).
- Hover: `bg-accent/60`; focus-visible ring on the link and menu; clicking the row outside the menu opens the document; the menu sits above the overlay (`z-index`) and stops propagation.
- Menu (`aria-label="Actions for {title}"`): Open; owner only — Rename, Share, Delete (destructive). "Share" mounts the same Share dialog used in the editor for that row's document. Menu items keyboard navigable; menu closes on action.
- Shared rows show the role badge only; never expose the owner's email.
- Do not render Share/Delete/Rename for non-owners.
- Delete confirmation names the title.

**Filters and search**

- "All Documents" is the recent-documents view: both sections, each ordered by document `updated_at` DESC (My Documents first, then Shared with me).
- "My Documents" shows only owned; "Shared with Me" only shared.
- Counts reflect currently loaded rows; when a list is truncated, label its count "100+ recent" rather than implying a total.
- Search is case-insensitive title substring over loaded lists; input has `aria-label="Search documents"` and a clear button; Esc clears when focused; results update after 150 ms debounce (client only).
- No results: "No documents match “{query}”" + Clear search.
- If an owned or shared list is truncated at the 100 cap, show a non-blocking notice in that section: "Showing your 100 most recent documents in this list."

**Empty states**

- Owned empty, all view: "Start your first document" + New document / Import.
- Shared empty: "Nothing shared with you yet" + explanatory copy; no CTA that cannot work.
- Both empty: single combined empty state with both CTAs.

**Loading:** route `loading.tsx` with header, search, sidebar, and 6 skeleton rows; no spinner-only screen.

**Error:** dashboard fetch failure renders an inline card: "We couldn't load your documents." + Retry (calls `router.refresh()`), plus a secondary "Reload page". No stack traces.

**Mutation feedback**

- Create: button shows "Creating…"; on success navigate to `/documents/{id}`; on failure toast + inline error.
- Rename: dialog with current title, max 200, Save disabled while blank/pending; the row's `revision` is sent as `baseRevision`. Success updates row and toast. On 409, close the dialog, `router.refresh()` the list, and toast "This document changed elsewhere. Try again." Other failures keep the dialog open with inline error.
- Delete: AlertDialog; on success remove row + toast; failure toast with retry guidance.
- Import: opens import dialog (Section 12.6).

**Responsive**

- `< lg`: sidebar hidden; filter chips shown; actions wrap below the title if needed; rows remain single-line title with meta beneath.
- `< sm`: header actions stack (New document full-width first, Import secondary full-width), search full-width, row menu 36 px touch target.
- 320 px: no horizontal scroll; title truncates; badges may wrap below meta.

**Acceptance:** owned/shared separation is visible and correct; every control is real; deleting requires confirmation; filters/search have empty states; owner-only actions absent for others; keyboard-only operation works.

### 12.4 Editor — `/documents/[id]`

**Hierarchy**

```text
(app)/layout.tsx
└─ documents/[id]/page.tsx (server)
   └─ DocumentEditor (client; receives initial document, including accessRole)
      ├─ EditorHeader (sticky top-0, h-14, border-b, bg-background)
      │  ├─ IconButton back (aria-label "Back to documents")
      │  ├─ Title zone
      │  │  ├─ [owner] DocumentTitleInput (input, aria-label "Document title")
      │  │  └─ [editor/viewer] h1-like static title (truncated)
      │  ├─ Badge ("View only" for viewer; "Shared · Can edit" for editor; none for owner)
      │  ├─ SaveStatus (owner/editor only)
      │  └─ [owner] Share button (Users icon + "Share")
      ├─ EditorToolbar (sticky below header; owner/editor only)
      └─ main (bg-background; py-6/10)
         └─ div (mx-auto max-w-[760px])
            └─ EditorCanvas (bg-card, border, rounded-xl, shadow-xs, min-h)
               └─ DocumentEditorContent (TipTap EditorContent, px-5/12, py-8/12)
```

**Header**

- Back: flush pending save (≤ 2 s) then navigate to `/`; if user arrived from a shared list, still return to `/` (single, predictable destination).
- Owner title input: borderless, 20/28 weight 600, width fills available space, `maxLength=200`; shows focus ring only when focused. A blank title is never enqueued; content saves omit `title` while it is blank. On blur, revert to the last saved title and show a brief inline message "Title can't be empty."
- Editor/viewer title: static text, truncates with ellipsis; full title available via `title` attribute and accessible text.
- SaveStatus (Section 15.4) with icon + text, `aria-live="polite"`.
- Share opens dialog for owner only. Editor/viewer never see it.
- `< md`: two-row header — row 1: back + title; row 2: role badge + save status (owner/editor) and Share (owner). Title truncates. Toolbar below.
- Viewer: no toolbar, no save status; content rendered read-only (`editable: false`), selection allowed.

**Toolbar**

- Height 44 px; sticky under header; horizontal scroll at `< md` with edge fade and no page overflow; buttons min 32×32 (36 touch on mobile).
- Groups separated by 1 px dividers and `role="group"` with `aria-label`:
  1. History: Undo, Redo (icons, labelled, disabled when unavailable).
  2. Block: Heading dropdown (Paragraph, Heading 1, Heading 2, Heading 3) showing active value.
  3. Inline: Bold, Italic, Underline (`aria-pressed`).
  4. Lists: Bullet list, Numbered list (`aria-pressed`).
- All icon-only controls have `aria-label` + tooltip; shortcut hints in tooltip where present.
- Active states use `--primary-soft` fill and indigo icon; disabled uses 50% opacity.
- Clicking a toolbar button does not steal editor focus (`onMouseDown` preventDefault) so selection applies.
- Keyboard: Tab reaches each control; Enter/Space activates; Arrow keys optional roving focus (not required). `Ctrl/Cmd+B/I/U` handled by TipTap.

**Canvas**

- `DocumentEditor` is loaded by the `"use client"` `editor-loader.tsx` via `next/dynamic` with `ssr: false` (the dynamic call must live in a client module), with a matching canvas skeleton, so TipTap/ProseMirror never runs during SSR and cannot cause hydration mismatches.
- White surface, max-width 760 px, radius 12, 1 px border, `shadow-xs`; min-height `calc(100dvh - 220px)`.
- Content padding 32–48 px desktop, 20 px mobile; editor body 17/1.75; paragraphs 12 px apart; headings have 24 px top / 8 px bottom rhythm.
- ProseMirror focus outline is suppressed only because the whole canvas is an obvious writing surface; the header and toolbar retain visible focus rings. Selection uses `--selection`.
- Lists use disc/decimal with 24 px indent; nested lists supported by TipTap but nesting via UI is limited (Tab/Shift-Tab works).
- Links are indigo and underlined; `openOnClick: false`.
- Placeholder on empty doc: "Start writing…" in `--subtle-foreground`, not styled as content.
- A newly created empty document autofocuses the body; existing documents do not autofocus, to avoid scroll jumps.

**States**

- **Loading:** `loading.tsx` shows header bar skeleton + canvas skeleton; no flash of "not found".
- **Not found / no access:** dedicated panel: "Document not found" + "It may have been deleted, or you may not have access." + Back to documents. Rendered with 404 semantics; never reveals whether the id exists.
- **Viewer:** read-only content; badge; no toolbar/save.
- **Editor:** editable content, static title, save status, no share.
- **Owner:** editable title + content, save status, share.
- **Conflict:** warning banner above canvas (Section 15.5).
- **Save error:** non-blocking banner with Retry; content remains editable.
- **Document deleted/revoked mid-session:** on 404 stop autosave and show full-page not-found panel; on 403 switch to read-only with notice "Your edit access was removed." Local content is preserved in the editor for copy; no further saves.

**Acceptance:** formatting persists; autosave status is truthful; no lost writes; viewer cannot type; editor cannot rename; mobile has no horizontal overflow; toolbar reachable by keyboard; dialog interactions correct.

### 12.5 Share dialog (owner only)

**Hierarchy**

```text
ShareDialog (Radix Dialog, max-w-[520px])
├─ DialogHeader: "Share “{title}”" + description
├─ Add form (grid: email input + permission select + Add button)
│  ├─ aria-label "Recipient email"; placeholder "name@example.com"
│  ├─ PermissionSelect (Can view / Can edit)
│  ├─ Add button (loading state)
│  └─ Inline error / success message (aria-live)
├─ Separator
├─ "People with access"
│  ├─ Skeleton rows while loading
│  ├─ Empty: "Only you have access right now."
│  └─ CollaboratorList
│     └─ row: avatar initial, email + display name, PermissionSelect,
│              Remove icon button (opens confirm)
└─ DialogFooter: note "Only you can change access." + Close
```

**Behavior**

- On open: fetch `GET /shares`; skeleton ≤ 300 ms; failure shows retry row.
- Add: trim/lowercase email; permission default `viewer`; client validates email shape; pending disables form.
- Errors:
  - unknown email → inline "No registered user with that email. Ask them to create an account first."
  - self → "You already own this document."
  - duplicate → "This person already has access. Change their role below."
  - network/500 → "Couldn't add access. Try again."
- Success: clear email, toast "Access granted", append/refresh the collaborator list (RPC orders oldest first).
- Change permission: optimistic select with pending disabled state; on failure revert + inline error; success toast.
- Remove: AlertDialog "Remove access for {email}? They will immediately lose access." On success remove row + toast.
- Owner row is not listed as a removable collaborator; no ownership transfer.
- Closing while a mutation is pending is allowed but does not cancel the request; the list refreshes on next open. Esc closes when idle.
- Focus enters the email input; tab order logical; focus returns to Share trigger.

**Responsive:** dialog width `calc(100vw - 32px)`, max 520; collaborator rows stack permission controls under the email at `< sm`; internal scroll.

**Acceptance:** each error is distinguishable; duplicates/self blocked; permission change persists; revoke is confirmed; keyboard focus contained and restored.

### 12.6 Import dialog

**Hierarchy**

```text
ImportDialog (max-w-[480px])
├─ DialogHeader "Import a document"
├─ Drop zone / file picker (accept=".txt,.md,text/plain,text/markdown")
│  ├─ Upload icon, "Choose a .txt or .md file"
│  ├─ "Up to 1 MB"
│  └─ selected file: name, size, Remove
├─ Inline error (aria-live)
└─ Footer: Cancel + Import (primary, loading)
```

- Click/drag-and-drop; the file input remains keyboard accessible and `aria-describedby` links format/size help.
- Client checks: extension case-insensitive, size ≤ 1,048,576 bytes, non-empty file. Errors shown inline and Import disabled.
- Import sends multipart to `/api/documents/import`; button shows "Importing…"; duplicate submits blocked.
- Success: close dialog, toast "Document imported", navigate to `/documents/{id}`.
- Failure: keep dialog open, show server message mapped by code; remove the selected file? Keep it so the user can retry or replace.
- Closing during upload is prevented (Cancel disabled) to avoid ambiguous state.

**Acceptance:** all import error classes are visible; success creates exactly one document; no HTML/script execution.

### 12.7 Delete confirmation

- AlertDialog max-width 420; title "Delete “{title}”?"; body "This permanently deletes the document and removes access for everyone. This can't be undone."
- Cancel (default focus), Delete (destructive). Pending state "Deleting…".
- Success: row removed, toast "Document deleted", `router.refresh()`.
- Failure: dialog closes, toast with error; row remains.

### 12.8 Global error and not-found screens

- `app/error.tsx`: calm panel, "Something went wrong", "Try again" (`reset()`), "Back to documents". No technical details.
- `app/not-found.tsx`: "Page not found" + link to `/`.
- API errors never render raw payloads; client maps codes to the messages in Section 10.2.
- Root `not-found` has brand and consistent spacing.

---

## 13. Responsive and Accessibility Requirements

### 13.1 Breakpoints and layout behavior

Tailwind defaults; required behavior:

| Width | Dashboard | Editor |
|---|---|---|
| 320–639 | Single column; filter chips; stacked header actions; search full width; row menu 36 px; no overflow | Two-row header; toolbar horizontal scroll; canvas edge-to-edge (no radius), 20 px padding; save status compact ("Saving…"/"Saved") |
| 640–1023 | Chips retained; actions inline; search max 320 | Header single row if space permits; toolbar wraps/scrolls; canvas card with margins |
| ≥ 1024 | Sidebar 248 px + content; page max 1120 | Header single row; toolbar fixed-height; canvas 760 px centered |
| ≥ 1280 | Same with larger outer margins | Same |

Rules:
- Global `overflow-x: hidden` is **not** used to mask bugs; layouts must genuinely fit. Long titles truncate with `min-w-0`/`truncate`.
- Dialogs: `max-height: calc(100dvh - 2rem)`, internal scroll, sticky footer where needed.
- Touch targets ≥ 40 px where practical; icon buttons 36 px minimum.
- Editor canvas uses `dvh` units for mobile browser chrome.

### 13.2 Accessibility checklist (must pass)

1. One `main` landmark per page; header/nav landmarks; skip link "Skip to content" as the first focusable element in `(app)` layout.
2. Every icon-only control has `aria-label`; tooltips supplement but do not replace labels.
3. Form controls have associated `<Label>` or `aria-label`; errors linked via `aria-describedby`; invalid fields use `aria-invalid`.
4. Dialogs use Radix focus trap, labelled title/description, Esc dismissal when idle, and focus return.
5. Save status uses `role="status"`/`aria-live="polite"`; errors use `role="alert"` sparingly and only for actionable failures.
6. Toolbar uses `role="toolbar"` with grouped controls; toggle buttons expose `aria-pressed`.
7. Badges/status include text, not color alone.
8. Contrast meets WCAG AA for all essential text and UI boundaries.
9. Keyboard-only path exists for: login, create, open, format, save, back, share, import, delete, revoke.
10. Focus visible on all interactive elements in all states (including rows and destructive buttons).
11. `prefers-reduced-motion` disables non-essential transitions.
12. Heading hierarchy: page title is the primary heading; editor content headings are semantic H1–H3 inside ProseMirror; no heading is used purely for size.
13. Images/icons decorative → `aria-hidden="true"`; meaningful icons have text.
14. Toasts are announced (Sonner) and never the only indication of success for destructive actions.
15. Zoom to 200% does not cause horizontal loss of controls; text remains readable.

### 13.3 Reduced motion and focus specifics

- Transitions limited to color/opacity/border/shadow; no parallax.
- Dialog entrance: opacity/scale ≤ 2%; disabled under reduced motion.
- Focus ring `2px` `--ring`, offset `2px`; on `--primary` surfaces use a white inner ring if contrast requires.
- Do not auto-focus the editor title on page load; focus management is explicit (dialogs, newly created empty doc).

---

## 14. File Import Specification

### 14.1 Accepted input

| Property | Rule |
|---|---|
| File count | Exactly 1 per request |
| Extensions | `.txt`, `.md` (case-insensitive), determined from the filename's final extension |
| MIME type | Advisory only; never trusted for acceptance. Extension + content checks are authoritative. |
| Max size | **1 MiB = 1,048,576 bytes** (client and server) |
| Encoding | UTF-8 (strict); BOM stripped if present; CRLF/CR normalized to LF; invalid sequences rejected |
| Binary detection | Reject NUL bytes or decode failure |
| Empty | Reject if content is empty or only whitespace |
| Filename | Required; used only to derive a title, never as a path |
| Requests > ~4.5 MB | Rejected from `Content-Length` before parsing when the header is present (platform limit) |

### 14.2 Title derivation

1. Take the filename's basename (strip any client-provided path segments).
2. Remove the final `.txt`/`.md` extension (case-insensitive).
3. Replace `_` with spaces; strip control characters; collapse whitespace; trim.
4. Truncate to 200 Unicode code points.
5. If blank, use "Imported document".

### 14.3 `.txt` conversion

- Split on blank lines (`\n\s*\n`) into paragraphs.
- Trim outer whitespace of each paragraph.
- Within a paragraph, single newlines become `hardBreak` nodes.
- Output `doc > paragraph*` with plain `text` nodes only.
- No marks; no HTML interpretation. Literal `<b>` remains text.

### 14.4 Markdown conversion (supported subset)

Use `marked.lexer(source, { gfm: true })` and a deterministic token converter. **Never** produce or render HTML.

| Markdown construct | TipTap output |
|---|---|
| `#`–`###` headings | `heading` level 1–3 |
| `####` and deeper | `heading` level 3 |
| Paragraphs | `paragraph` |
| Line breaks | `hardBreak` |
| `**bold**`, `__bold__` | `bold` mark |
| `*italic*`, `_italic_` | `italic` mark |
| Bullet lists | `bulletList` → `listItem` → `paragraph` |
| Ordered lists | `orderedList` (`start` normalized 1–9999) → `listItem` |
| Links `[text](url)` | `link` mark only if `http:`/`https:`/`mailto:` and ≤ 2048 chars; otherwise plain text |
| Inline code | plain `text` (backticks removed) |
| Fenced/indented code | one or more `paragraph`s preserving line text |
| Blockquotes | `paragraph`(s) |
| Horizontal rules | ignored |
| Images | alt text as plain text (never fetched or embedded) |
| Tables | flattened: each row's cell text joined by " — " in a paragraph |
| Raw HTML tokens | escaped text in a `paragraph`; tags are never interpreted |
| Unknown token types | flatten their text content into paragraphs |
| Empty/whitespace output | `EMPTY_FILE` |

- Nested lists deeper than 3 levels are flattened to the nearest allowed structure (defensive).
- Underline is not representable in standard Markdown; it is not inferred from `<u>` or `__text__` (the latter is bold per CommonMark).
- After conversion, run the TipTap Zod whitelist again before insert. If limits are exceeded, return `VALIDATION_ERROR` with a size-focused message.

### 14.5 Error mapping

| Condition | Code | Message shown |
|---|---|---|
| Extension not `.txt`/`.md` | `UNSUPPORTED_FILE` | "Only .txt and .md files are supported." |
| Size > 1 MiB (client/server) | `FILE_TOO_LARGE` | "Files must be 1 MB or smaller." |
| Zero/whitespace content | `EMPTY_FILE` | "The file is empty." |
| Invalid UTF-8 / NUL | `INVALID_ENCODING` | "This file isn't readable UTF-8 text." |
| Converter failure | `PARSE_ERROR` | "We couldn't read this file. Try a plain .txt file." |
| Converted content over limits | `VALIDATION_ERROR` | "The file is too large to import as a document." |
| Wrong content type | `UNSUPPORTED_MEDIA_TYPE` | "Unsupported upload format." |

### 14.6 Security requirements

- No `eval`, no dynamic `Function`, no filesystem writes, no outbound network calls during import.
- Uploaded bytes stay in memory for the request only; never stored raw.
- Only the converted, validated TipTap JSON is persisted.
- Filename is used as text; no path operations.
- HTML from Markdown is never rendered; raw HTML becomes text.
- Import always creates an owned document for the authenticated caller; no owner field accepted.
- Concurrency: one document per successful request; duplicate submission prevented client-side; a retried request creates a second document (documented, acceptable; user can delete).

---

## 15. Persistence and Autosave Strategy

### 15.1 Source of truth

- PostgreSQL is the only persistent store for documents and shares.
- No localStorage/IndexedDB persistence of documents; no fake success when Supabase is unreachable.
- Server responses return the authoritative `revision` and `updated_at`; the client stores the latest successful values.

### 15.2 Save triggers

| Trigger | Behavior |
|---|---|
| Content/title change | Debounce 800 ms after last change; if typing continues, force a save at 4 s since the first unsaved change |
| Title blur (owner) | Immediate flush if the trimmed title is non-blank; otherwise revert locally |
| `Ctrl/Cmd+S` | Immediate flush; prevent browser save dialog |
| Back navigation | Flush, await ≤ 2 s, then navigate |
| Tab hidden/unloaded | Flush on `visibilitychange` (hidden); `beforeunload` warns if unsaved or in-flight |
| Retry | Manual retry from error banner; automatic retry twice for network/5xx with 1 s and 2 s backoff |

### 15.3 Save state machine

States: `idle` (no changes), `dirty` (unsaved), `saving` (in-flight), `saved`, `error` (retryable), `conflict`, `read_only` (viewer/revoked), `not_found`.

Rules:
1. At most **one** PATCH is in flight per editor.
2. Edits during a save set `dirty` and queue exactly one follow-up flush after completion (coalesced, latest snapshot wins).
3. Each request carries `baseRevision = lastSavedRevision` and the current snapshot (`title` for owner only when non-blank, `content` for owner/editor).
4. On success: set `lastSavedRevision = response.revision`; if the snapshot changed during the request, immediately schedule the next save; otherwise `saved`.
5. On 409: enter `conflict`; **do not retry automatically**; preserve local content.
6. On 403: stop autosave, switch to read-only, show notice; do not discard local content.
7. On 404: stop autosave, show document-not-found panel.
8. On network/5xx: retry per policy, then `error`; content remains editable; no revision change.
9. Never send parallel PATCHes; never decrement/guess revision on the client.
10. No optimistic update of `lastSavedRevision`; only server responses advance it.

Reference algorithm (implementation must match observable behavior):

```text
onEdit(snapshot):
  pending = snapshot
  if !beforeUnloadArmed: arm prompt
  if state in conflict/read_only/not_found: return   // preserve local edits; never auto-save
  state = dirty
  scheduleTrailing(800ms)            // reset on each edit
  if firstUnsavedAt is unset: firstUnsavedAt = now
  if now - firstUnsavedAt >= 4000:  flush()

flush():
  cancelTimers()
  if state == conflict/read_only/not_found: return
  if inFlight: queued = true; return
  if pending equals lastSavedSnapshot: state = saved; return
  sent = pending; inFlight = true; state = saving
  PATCH { baseRevision: lastSavedRevision, ...sent } with 15s AbortController
  on 200: lastSavedRevision = res.revision; lastSavedSnapshot = sent
          inFlight = false; firstUnsavedAt = unset
          state = (pending != sent) ? dirty : saved
          if queued or pending != sent: queued = false; flush()
  on 409: inFlight = false; state = conflict; pause autosave
  on 403: inFlight = false; state = read_only; pause
  on 404: inFlight = false; state = not_found; pause
  on network/5xx: inFlight = false; retry up to 2x (1s, 2s) then state = error
```

### 15.4 Status UI

| State | Label | Visual | A11y |
|---|---|---|---|
| `dirty` | "Unsaved changes" | neutral dot | `aria-live` polite |
| `saving` | "Saving…" | spinner | `aria-busy="true"` on status |
| `saved` | "Saved" | check icon, success color | polite announcement |
| `error` | "Couldn't save" + Retry button | danger icon | `role="alert"` once, then status |
| `conflict` | "Out of date" | warning | banner + status |
| `read_only` | "View only" | lock badge | static |
| `not_found` | — | full-page panel | — |

Status text is always present; color is not the only signal. The label is compact on mobile ("Saving…" / "Saved") but keeps accessible full text.

### 15.5 Conflict UX

Banner above the canvas: "This document changed in another tab or session. Your latest edits are not saved yet."
Actions:
- **Load latest** (secondary): fetch the latest document; replace editor content (and the title input for owners) without emitting a new editor update; clear pending; update the saved revision/snapshot; and leave `conflict`. Requires confirmation because local unsaved edits are discarded ("Discard your unsaved changes and load the latest version?").
- **Overwrite with mine** (destructive-styled): after confirmation, PATCH with the latest revision. This intentionally wins the conflict; it is explicit, never automatic. If that PATCH returns 409 again (another edit landed), re-enter conflict and do not loop.
- **Keep editing** (secondary): hides the banner but keeps the editor in `conflict`; the status area shows a **Resolve conflict** button that reopens the banner. Autosave remains paused until Load latest or Overwrite is chosen. Local content stays editable for copying but is not saved.

No automatic merge; no last-writer-wins silently. If a timed-out request actually succeeded, "Load latest" reveals the saved content; the user may then continue from it.

### 15.6 Navigation and pending saves

- Back button: if `dirty`/`saving`, show a brief inline "Saving…" state, await the flush (max 2 s), then navigate. If the flush fails, or the state is `error`/`conflict`/`read_only` with unsaved local edits, show a confirm dialog: "Leave without saving?" / "Stay".
- Browser back/refresh: `beforeunload` prompt when `dirty`/`saving`/`error`/`conflict`, or `read_only` with unsaved local edits.
- `visibilitychange` flush attempt uses the same single-flight queue; it does not clear `conflict`.

### 15.7 Timestamps and revisions

- `updated_at` and `revision` are set by the DB trigger, never by the client.
- `revision` starts at 1; every successful update increments by 1.
- Dashboard sorts by `updated_at` DESC; relative times are computed client-side after mount to avoid hydration mismatch; `<time dateTime={iso}>` always contains an absolute fallback (e.g., "Oct 29, 2026").
- Server clocks are authoritative; timestamps serialized as ISO UTC.

### 15.8 Document creation and import

- Create inserts with revision 1 and the default empty doc; the new editor starts clean (`saved`, no autosave) until the first edit.
- Import inserts the converted document directly; it opens as saved with revision 1.
- Initial content is mounted as editor state (not applied via an update that marks the document dirty).
- No autosave request is sent for an unchanged document.

---

## 16. Security and Error Handling

### 16.1 Authentication and sessions

- Every protected page and API verifies `getUser()` server-side; no reliance on client state or middleware alone.
- Middleware/request entry point refreshes cookies but does not make authorization decisions.
- `next` redirects are parsed as URLs, then accepted only when they resolve to the same origin and a path that starts with `/`; reject protocol-relative (`//`), backslash, scheme, and control-character forms.
- Cookies: Supabase SSR httpOnly/SameSite=Lax; Secure in production (platform).
- Sign-out clears session cookies server-side.

### 16.2 Authorization

- Three layers:
  1. **UI** hides/disables impossible actions (never the boundary).
  2. **Server** `resolveDocumentAccess` + operation rules + strict DTOs.
  3. **PostgreSQL** RLS, column privileges, and triggers.
- 404 vs 403 policy (Section 9.2) prevents document enumeration.
- Owner identity comes only from `auth.uid()`; payloads reject unknown keys.
- Direct PostgREST calls with the anon key + a user JWT are covered by integration tests.
- No service-role key in application runtime or client bundles.

### 16.3 Content and XSS

- Content is TipTap JSON rendered by ProseMirror/prosemirror-view; no raw HTML, no `dangerouslySetInnerHTML`, no Markdown-to-HTML rendering.
- Server validates node/mark/attribute whitelists, sizes, and link protocols before every write.
- Import runs the same whitelist after conversion.
- Links: `http`, `https`, `mailto` only; `openOnClick: false`; `rel="noopener noreferrer"` if ever rendered as anchors outside ProseMirror.
- Titles are plain text (React escapes by default); no `innerHTML` usage.
- CSP is not added in the MVP because Next.js inline bootstrap scripts require a nonce pipeline; this limitation is disclosed. Baseline headers are set instead (16.6).

### 16.4 File import

- Extension, size, UTF-8, NUL, emptiness, and conversion limits enforced server-side.
- Upload buffered in memory (≤ 1 MiB accepted); no disk writes; no network fetches (images are reduced to alt text).
- `Content-Length` sanity check rejects obviously oversized requests before parsing.

### 16.5 Environment and secrets

- `.env*` gitignored except `.env.example`/`.env.test.example`, which contain names and placeholders only.
- Only `NEXT_PUBLIC_*` values reach the browser; the anon key is protected by RLS.
- `SUPABASE_SERVICE_ROLE_KEY` is used only by the seed script and integration tests, never imported under `src/`.
- No secrets in logs, error responses, screenshots, walkthrough, or docs.
- Rotate any key accidentally exposed; do not include real keys in the repo.

### 16.6 HTTP and error conventions

- Mutations: same-origin check on Route Handlers; JSON/multipart content-type enforcement. Auth Server Actions rely on Next.js's built-in Server Action origin checks in addition to SameSite cookies.
- Security headers in `next.config.ts` for all routes:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- HSTS is provided by Vercel.
- Errors:
  - Client sees stable codes + human messages; no SQL, Supabase text, stack traces, or internal IDs.
  - Server logs `{ requestId, code, status, route }`; never log content, emails, tokens, or cookies.
  - Unexpected exceptions → `INTERNAL_ERROR` 500 with a generic message.
  - `error.tsx` boundaries catch render failures; unhandled rejections in client hooks set UI error states.

### 16.7 Abuse and limitations (explicitly disclosed)

- No application-level rate limiting (relies on platform/Supabase defaults). Recipient resolution is confined to the owner-only atomic `grant_document_share`; there is no standalone lookup or bulk listing. Any signed-in user can create a document and test whether a specific email is registered by attempting a grant; this residual is accepted for the required unknown-user UX and documented in README/ARCHITECTURE.
- Full TipTap schema validation is application-side. The DB enforces JSON object type and serialized size, not the node/mark whitelist; a direct PostgREST editor can store malformed content. The renderer never injects HTML and ignores unknown nodes/attrs, but content integrity is not DB-enforced.
- No CAPTCHA, no bot protection, no audit log.
- No CSP, no MFA, no IP allowlist.
- Security claims are limited to what is implemented and tested.

### 16.8 Security verification (must be performed, not assumed)

1. Run RLS integration tests as owner/editor/viewer/unrelated (Section 17.3).
2. Attempt direct PostgREST updates: editor → title (must fail), viewer → content (must fail), unrelated → select/update/delete (must fail).
3. Attempt share insert as editor (must fail); duplicate/self share (must fail).
4. Submit content with `javascript:` link, `<script>` node, unknown node, oversized JSON (must be rejected).
5. Upload `.pdf`, a 2 MiB file, invalid UTF-8; import Markdown containing raw HTML (it must appear as text, never execute).
6. Inspect deployed bundle/network for service-role key absence.
7. Confirm `.env.local` is ignored by git.
8. Confirm no `lookup_user_by_email` RPC exists; a non-owner calling `grant_document_share` fails before email resolution.

---

## 17. Testing Strategy and Acceptance Criteria

### 17.1 Commands

```text
npm run lint             # ESLint, zero errors
npm run typecheck        # tsc --noEmit, zero errors
npm test                 # Vitest unit suite (jsdom)
npm run test:integration # RLS integration suite (requires local Supabase env)
npm run build            # production build
```

Success = all applicable commands exit 0. If integration prerequisites are unavailable, record it as **skipped/not run** with the reason—never as passing. Report actual outputs in SUBMISSION.md.

### 17.2 Unit tests (risk-prioritized)

**`tests/unit/validation-content.test.ts`**
- Accepts a representative valid doc (headings, marks, lists).
- Rejects unknown node types (`image`, `script`, `codeBlock`).
- Rejects unknown marks and unknown attrs.
- Rejects `javascript:`/`data:`/protocol-relative link hrefs.
- Rejects depth > 12, node count > 10,000, text > 500,000, JSON > 2 MiB.
- Rejects non-object content.
- Title validation: trims, rejects empty and > 200.

**`tests/unit/import-validation.test.ts`**
- Accepts `.txt` and `.md` (case-insensitive) at exactly the 1 MiB limit with readable text.
- Rejects `.pdf`, `.docx`, no extension, and `evil.txt.exe`.
- Rejects > 1 MiB (`FILE_TOO_LARGE`).
- Rejects empty/whitespace (`EMPTY_FILE`).
- Rejects invalid UTF-8 and NUL (`INVALID_ENCODING`).
- Title derivation: strips only the final extension, handles spaces/underscores, truncates to 200, falls back to "Imported document".

**`tests/unit/markdown-to-tiptap.test.ts`**
- H1–H3 map correctly; deeper headings clamp to 3.
- Bold/italic and nested marks; underline is not produced by Markdown (`__text__` is bold per CommonMark).
- Bullet/ordered lists; ordered `start`.
- Safe links preserved; `javascript:` link downgraded to text.
- Raw HTML `<script>` becomes text; no HTML output anywhere.
- Images become alt text; tables/flattening; code blocks become paragraphs.
- Output passes the content Zod schema.

**`tests/unit/autosave-reducer.test.ts`**
- Dirty → saving → saved transitions.
- Edits during in-flight save schedule exactly one follow-up with the latest snapshot.
- 409 enters conflict and stops automatic saves.
- 403/404 stop saving and set read-only/not-found.
- Network retry policy (2 retries) then error; success clears retry count.
- Revision only advances from server responses.

**`tests/unit/access-role.test.ts`**
- Owner detection precedes the share-role read.
- Editor can edit content but not title (policy predicate tested at the rule level).
- Viewer cannot edit; unrelated resolves `none`.
- 404-vs-403 mapping helper.

### 17.3 Integration tests (database security)

**`tests/integration/rls.test.ts`** — runs only when `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY` are set and a local Supabase is running (`describe.skipIf`; prints a skip reason otherwise).

Setup:
1. Service-role admin creates four confirmed users: owner, editor, viewer, stranger (unique test emails).
2. Sign in each with the anon client (real JWT, RLS active).
3. Owner creates a document; assert `revision = 1`, default title, and empty doc content. Owner updates content and re-reads it to prove persistence, then grants editor/viewer shares via `grant_document_share`.
4. Tests:
   - **Owner:** select/update title+content; read collaborators; grant by email; change/revoke share; delete.
   - **Editor:** select succeeds; content update succeeds; `title` update fails (trigger `42501`); delete fails; share insert/update/delete fails; collaborator and grant RPCs fail.
   - **Viewer:** select succeeds; content update must change nothing (0 rows or permission error); delete fails; share mutation fails.
   - **Stranger:** select returns no row (404 equivalent); update/delete affect 0 rows; cannot see shares; collaborator and grant RPCs fail.
   - **Anonymous (anon key, no session):** select/insert/update/delete and both RPCs rejected.
   - **Duplicate share:** second `grant_document_share` raises `23505`.
   - **Self-share:** `grant_document_share` raises `P0001`; direct insert is rejected by RLS.
   - **Unknown email:** owner grant raises `P0002`; non-owner grant fails at the ownership check before lookup.
   - **No standalone lookup:** `lookup_user_by_email` does not exist (PostgREST 404 / absent from `pg_proc`).
   - **Owner change:** direct update of `owner_id` fails.
   - **Column privilege:** direct update of `revision`, `created_at`, `updated_at` fails.
   - **Cascade:** owner deletes document → shares disappear; recipient select returns none.
   - **Profile privacy:** stranger cannot select another user's profile row.
5. Cleanup: delete created users (cascades test data).

### 17.4 Route/handler tests (optional if time permits)

- Mock the Supabase server client; assert 401 without user, 422 for strict-schema violations, 403 for wrong role, 409 for conflict, and the response envelope shape.
- At minimum, test one autosave conflict path and one share validation path.

### 17.5 Manual smoke test (required, executed against deployed app)

Record pass/fail in SUBMISSION.md.

1. **Create:** sign in, click New document, confirm default title and editor opens; refresh lists it.
2. **Format + persist:** apply H2, bold, italic, underline, bullet + numbered lists; wait for "Saved"; hard refresh; formatting and text remain.
3. **Rename + reopen:** rename on dashboard and in editor; return to dashboard; reopen and confirm.
4. **Import:** import a `.md` with heading/bold/list and a `.txt`; confirm editable content; confirm `.pdf`/oversize/empty errors.
5. **Share:** owner shares with a second account as Editor; document appears under Shared with Me.
6. **Permissions:** as editor, edit content (persists), confirm title is read-only and Share/Delete absent; as viewer, confirm read-only, no toolbar, save does not occur; owner changes editor→viewer and confirms effect after refresh.
7. **Unrelated user:** sign in as a third account with no grant; dashboard does not list the document; direct URL shows not-found; API returns 404/403 per policy.
8. **Mobile:** 375 px and 320 px: no horizontal overflow; create/open/format/save/share usable; toolbar scrolls; dialogs fit.
9. **Errors/loading:** throttle/offline → autosave error + retry preserves content; force 409 via two tabs → conflict banner; slow network shows skeletons; empty/invalid import shows inline errors.
10. **Deployed:** repeat create/format/refresh/share/viewer denial on the Vercel URL with demo accounts; confirm no console errors and assets load.
11. **Accessibility spot check:** run axe DevTools (or equivalent) on dashboard, editor, and share dialog; fix critical/serious findings. Record what was checked.

### 17.6 Acceptance criteria traceability

| Assignment requirement | Spec IDs | Verification |
|---|---|---|
| Create, rename, edit, save, reopen | FR-01/02/03, 4.2/4.3 | Smoke 1–3; unit + integration |
| Rich text formatting | FR-04, 11.3, 12.4 | Smoke 2; content schema tests |
| Import `.txt`/`.md` | FR-05, Section 14 | Smoke 4; import unit tests |
| Ownership + sharing | FR-06/09, Sections 8–10 | Smoke 5–7; RLS integration |
| Owned vs shared distinction | FR-07, 12.3 | Smoke 1, 5; UI review |
| Persistence | FR-08, Section 15 | Smoke 2–3; DB tests |
| Server auth + validation | FR-09, Sections 9/10/16 | RLS + validation tests |
| Loading/empty/success/error | FR-10, Sections 12/15 | Smoke 9; UI review |
| Automated test | FR-11, Section 17 | `npm test` (and integration if available) |
| Docs, deployment, AI note, manifest, video | Section 21 | File review; live URL; walkthrough |

### 17.7 Definition of test success

- No test is marked passing unless executed against the current code.
- Integration tests must actually exercise PostgREST with real user JWTs; mocked authorization tests alone do not prove RLS.
- If a test is flaky, fix the test or the code; do not loosen assertions to hide failures.
- Known failures are disclosed in SUBMISSION.md with root cause and impact.

---

## 18. Environment Variables and Deployment

### 18.1 Environment variables

| Name | Scope | Purpose | Required |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Public anon/publishable key; RLS-protected | Yes |
| `NEXT_PUBLIC_SITE_URL` | Browser + server | Canonical app URL for auth redirects (`http://localhost:3000` locally) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Local scripts/tests only | Seed and test admin operations; **never** deployed to runtime | Only for seed/tests |
| `SUPABASE_TEST_URL` | Test process | Local Supabase URL | Integration only |
| `SUPABASE_TEST_ANON_KEY` | Test process | Local anon key | Integration only |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` | Test process | Create/cleanup test users | Integration only |

Rules:
- Never print or commit values. `.env.example` and `.env.test.example` contain empty placeholders.
- Vercel holds production/preview values; local uses `.env.local`.
- No secret is prefixed `NEXT_PUBLIC_`.
- If Supabase credentials are unavailable: use the Supabase CLI local stack (`supabase start`) or a separate hosted dev project. There is **no** localStorage or mock-persistence fallback in the app. Unit tests still run; the app surfaces a clear configuration error.

### 18.2 Local setup

Prerequisites: Node 22 LTS, npm, git, Docker Desktop (for local Supabase), Supabase CLI (`npx supabase` or installed), a modern browser.

Required `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:integration`, `seed:demo`, `db:reset` (the last two wrap Supabase CLI/seed commands).

1. `npm install`
2. `git init` (if not already) and create the GitHub remote for deployment.
3. `npx supabase start` (Docker required), then `npx supabase db reset` to apply migrations.
4. Read URL/anon key from `npx supabase status` and create `.env.local` from `.env.example`.
5. `npm run dev` → `http://localhost:3000`.
6. Create an account via `/signup` (local confirmation is disabled in `config.toml`) or run `npm run seed:demo` with the service-role key to create demo users/documents.
7. Verify RLS: `npm run test:integration` with test env vars.

If Docker is unavailable: create a dedicated Supabase dev project, run `npx supabase link` + `npx supabase db push` (or apply the three SQL files in order), and use its URL/anon key locally. Document which path was used.

### 18.3 Database and auth configuration

- Apply migrations in order; do not edit applied migrations—add new ones.
- Verify: RLS enabled on all three tables; policies present; helper functions in `private`; triggers created; generated types regenerated.
- Supabase Auth settings:
  - Site URL: `NEXT_PUBLIC_SITE_URL`.
  - Redirect allowlist: `${SITE_URL}/auth/callback` for local and production (and Vercel preview if used).
  - Email/password enabled; email confirmation ON in production. For demo accounts, create them pre-confirmed in the dashboard or via admin API.
  - Default Supabase email delivery is rate-limited; for a demo, pre-confirm demo users to avoid waiting on mail.
- No service-role key in Vercel project environment variables for the app; if the seed script is run against production, use a temporary local shell env var and remove it.

### 18.4 Demo-account strategy

- Create three accounts: `owner@ajaia.demo`, `editor@ajaia.demo`, `viewer@ajaia.demo` (pre-confirmed, non-production password documented in SUBMISSION.md), plus optionally a `stranger@ajaia.demo` for the denial demo.
- `scripts/seed-demo.mjs` (service role, local or one-off) is idempotent:
  - Ensures users exist (or documents their manual creation).
  - Creates "Product Brief" (owner) and "Launch Checklist" (owner) and grants editor/viewer access to one document.
- Demo data is clearly labeled and not required for the app to function.
- Demo credentials are intentionally shareable; they are not production secrets. Rotate/delete demo users after evaluation if appropriate.

### 18.5 Vercel deployment

1. Push the repo to GitHub.
2. Import into Vercel; framework preset Next.js; Node 22; build `npm run build`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` for Production (and Preview if needed).
4. Apply Supabase migrations to the production project and configure Auth Site URL/redirects.
5. Deploy; run the deployment smoke tests (Section 17.5, item 10).
6. Add the live URL to README/SUBMISSION and record the walkthrough.
7. Re-deploy after any env or schema change; verify no build warnings that indicate missing env vars.

### 18.6 Deployment smoke tests

- `/login` renders; sign-in works; session persists across refresh.
- Authenticated `/` renders owned/shared lists; unauthenticated `/` redirects.
- Create → edit → save → refresh persists in production DB.
- Import works in production.
- Share with demo editor/viewer; permissions enforced after re-login.
- Direct document URL as unrelated user → not-found.
- Browser console: no errors, no service-role key, no auth warnings.
- RLS enabled in the production project (query `pg_tables`/dashboard).

### 18.7 Common failure modes

| Symptom | Likely cause | Resolution |
|---|---|---|
| Endless redirect to `/login` | Missing/wrong Supabase env; cookies not set; middleware matcher wrong | Verify env, URL/anon key, cookie handling, entry-point filename for pinned Next version |
| `relation "public.documents" does not exist` | Migrations not applied to the target project | Run `supabase db push` / apply SQL in order |
| RLS returns no rows for owner | Policies/helpers not applied, `auth.uid()` null, or wrong `search_path` | Re-run migration 03; verify session; check function schema |
| `permission denied for table` | Grants not applied after table creation | Re-run grants in migration 03 |
| Editor can rename via REST | Title trigger/column privileges missing | Re-check `documents_before_update` and grants |
| Viewer can write | Update policy uses wrong predicate | Verify `private.can_edit_document` and policy |
| Share-by-email grant returns `USER_NOT_FOUND` | Profiles trigger missing or email not lowercased | Verify auth trigger, `lower(email)`, and that the recipient has signed up |
| Non-owner can probe emails | Old lookup RPC still deployed or RPC lacks owner check | Drop `lookup_user_by_email`; verify owner check precedes lookup |
| Duplicate/self share not blocked | PK/RPC/server check missing | Re-verify schema, `grant_document_share`, and handler |
| Auth email links go to wrong host | Site URL/redirect allowlist mismatch | Update Supabase Auth URLs; use `NEXT_PUBLIC_SITE_URL` |
| Import fails only in production | Platform body limit / missing multipart handling | Enforce size before parse; confirm 1 MiB limit |
| Hydration mismatch on timestamps | Server/client locale differences | Render absolute fallback, compute relative after mount |
| 409 on every save | Client not updating `lastSavedRevision` from responses | Fix autosave reducer; inspect network responses |
| Build fails on types | Stale generated DB types | Regenerate `src/types/database.ts` |
| Service-role key exposed | Imported into client/server runtime | Remove; rotate key; restrict to scripts |

### 18.8 External prerequisites and unresolved assumptions

These cannot be satisfied by code alone and require the user's credentials or explicit authorization:

1. **Supabase project** (or permission to create one) plus URL and anon key; ability to run migrations and configure Auth redirect URLs.
2. **Vercel account** plus a GitHub repository (the current directory is not a git repo) for deployment.
3. **Docker Desktop** for local Supabase, or a dedicated hosted dev Supabase project.
4. **Email confirmation policy**: production needs a working Auth email path; demo accounts should be pre-confirmed to avoid email rate limits.
5. **Demo accounts and sample data**: creating users requires service-role/admin access, used only locally/one-off.
6. **Walkthrough recording and screenshots**: browser tooling and a place to host the video URL.

If any prerequisite is unavailable at implementation time, the app must not fake the integration. Deliver code, migrations, unit tests, and docs; mark deployment/RLS integration as **blocked/not run** with the reason in SUBMISSION.md. Never assume external services are configured without evidence.

---

## 19. Implementation Roadmap and Timebox

### 19.1 Priorities

**P0 — mandatory (must ship):**
- Schema + RLS + triggers/grants.
- Auth (login/signup/signout/callback) and protected routes.
- Dashboard with owned/shared separation, create, rename, delete + confirmation, open.
- TipTap editor with required formatting, persistence, revision-safe autosave.
- Import `.txt`/`.md` with validation.
- Sharing (viewer/editor) with enforcement in server + DB.
- Responsive/accessible core UI, loading/empty/error states.
- At least the specified unit tests; run RLS integration tests when a local or hosted database is available. If no database is available, record the documented skip—never claim SQL/RLS verification without executing it.
- README, ARCHITECTURE, AI_WORKFLOW, SUBMISSION, WALKTHROUGH, deployment attempt.

**P1 — quality (included in the 6h plan):**
- Save-status polish, conflict UX, retry/backoff.
- Client-side title search, counts, truncation notice.
- Collaborator role change, revoke confirmation, inline share errors.
- Mobile toolbar/header refinements; skeletons; focus/ARIA pass.
- Screenshots/GIF; expanded README failure modes.

**P2 — only after DoD, never delaying P0:**
- PDF export, comments, version history, real-time collaboration, dark mode, link insertion toolbar, password reset, pagination.

### 19.2 Six-hour schedule

| Time | Phase | Deliverable/checkpoint |
|---|---|---|
| 0:00–0:20 | Bootstrap | `create-next-app` (TS, Tailwind, App Router, src), shadcn init, deps, tokens, lint/typecheck pass |
| 0:20–1:10 | Database | Local Supabase, 3 migrations, helper/trigger/grants, generated types, seed script, manual RLS query check |
| 1:10–1:30 | Auth shell | Supabase clients, middleware/proxy, login/signup/callback/signout, protected layout, top nav |
| 1:30–2:05 | Dashboard | Repository + list API + dashboard UI, filters, empty/loading/error, create/delete/rename |
| 2:05–3:15 | Editor | TipTap schema/toolbar, load, autosave hook + revision conflicts, status UI, read-only roles, mobile layout |
| 3:15–3:50 | Sharing | Share RPC/repository/routes, dialog, collaborator roles, revoke, permission UI |
| 3:50–4:15 | Import | Parser/converter + route + dialog + tests |
| 4:15–4:45 | Tests | Unit suites, local RLS integration, fix failures; record actual results |
| 4:45–5:10 | Polish/a11y | Focus rings, labels, reduced motion, 320/375/768 review, skeletons, toasts |
| 5:10–5:45 | Deploy/docs | Supabase prod, migrations, Vercel env/deploy, smoke, README/ARCH/AI/SUBMISSION/WALKTHROUGH, screenshots |
| 5:45–6:00 | Buffer | Fix deployment issues; capture screenshots; record the 3–5 minute walkthrough; final verification |

### 19.3 Cut order (if behind)

Cut in this order, and note each cut in SUBMISSION.md:
1. Client-side title search.
2. Relative-time display (use absolute dates).
3. Collaborator permission change UI (keep add + revoke).
4. Import link preservation (keep text).
5. Overwrite conflict option (keep Load latest + manual copy).
6. Screenshots/GIF beyond one dashboard + one editor image.
7. Integration test breadth (never remove the viewer/stranger/editor core assertions; if no database is available, report skipped—do not claim SQL/RLS verification).

**Never cut:** RLS, server authorization, title/content permission enforcement, import validation, persistence, core CRUD, at least the unit test suite, README setup, deployment attempt, honest disclosure.

### 19.4 Checkpoints (hard stops)

- After 1:10: migrations apply cleanly and RLS is demonstrated with two users on a local or hosted database. If no database is available, mark RLS verification blocked and continue with code/unit tests; never fake the check.
- After 3:15: autosave/refresh fidelity works; otherwise defer search/polish, not correctness.
- After 4:45: tests run; if failing, fix P0 tests before docs/deploy.
- After 5:45: deploy + docs complete; walkthrough recorded; no new features.

### 19.5 AI-assisted implementation workflow (binding)

1. **Read before coding.** Before each task, read this spec and the sections it touches (DB → 8–10, UI → 11–13, import → 14, autosave → 15, security → 16). Do not rely on memory of the spec.
2. **One verifiable slice at a time.** Each task must name its requirement ID, files to touch, and an observable check (a test, a query result, or a manual step). Stop and verify before starting the next slice.
3. **Follow existing conventions.** Read neighboring files first; reuse installed libraries, validation patterns, and design tokens. Do not restructure working code or add a dependency without a stated need and version pin.
4. **Check documentation for unfamiliar APIs.** Verify Next.js request entry-point naming, `@supabase/ssr` cookie APIs, TipTap 3 extension setup, `marked` token shapes, and shadcn/Tailwind version compatibility against current official docs before use.
5. **SQL/RLS is reviewed, not trusted.** AI-generated migrations are read line by line: RLS enabled, `USING`/`WITH CHECK`, definer `search_path`, grants, column privileges, recursion, indexes. Exercise the adversarial cases in Section 16.8.
6. **Run the gates.** After each slice: `npm run lint`, `npm run typecheck`, relevant `npm test`; before delivery also `npm run build` and integration tests when available. Fix failures rather than weakening assertions.
7. **Verify in the running app.** Persistence, permissions, import errors, conflict UI, and mobile layout are checked in a browser; a green unit test does not prove RLS or deployment.
8. **Record deviations and rejected output.** Log material AI suggestions that were rejected or modified, why, and how the final code was verified in `AI_WORKFLOW.md`. Add spec deviations to Section 23.1.
9. **No fabricated completion.** Never claim a test passed, a policy works, or a URL is live without observed evidence. Report skipped work and blockers explicitly.
10. **Respect the cut line.** When the timebox is at risk, cut in the Section 19.3 order; do not trade correctness or security for extra features.

---

## 20. Known Tradeoffs and Deferred Features

| Tradeoff / deferred item | Reason | Mitigation / disclosure |
|---|---|---|
| No real-time collaboration or presence | Timebox; conflict detection is safer than partial sync | Revision conflicts + explicit reload/overwrite; documented |
| No merge of concurrent edits | Merge is complex and risky | Last-writer-wins only with explicit user confirmation |
| Title changes require owner | Assignment rule; editors edit content only | Field-level checks in UI, server, DB trigger |
| Search is client-side over titles, first 100 per list | Timebox; avoids FTS migration | Truncation notice; documented limit |
| No pagination beyond 100 per list | Small-scale assignment | Documented; straightforward follow-up |
| Sharing only with registered users, exact email | Assignment scope | Clear unknown-user error; no email invites |
| Share-by-email resolution is owner-only and atomic | Removes global lookup without a service-role runtime | No standalone lookup; any signed-in user can still test emails via a self-created document; rate limiting absent (disclosed) |
| DB does not validate full TipTap schema | Recursive JSON validation in PostgreSQL is disproportionate for the timebox | App rejects invalid writes; DB enforces object/size; renderer whitelists nodes/attrs and never injects HTML; direct PostgREST can still store malformed content (disclosed) |
| No rate limiting / CAPTCHA | Timebox; platform defaults | Disclosed security limitation |
| No CSP | Next.js inline bootstrap/nonce pipeline out of timebox | Baseline headers; no HTML injection; disclosed |
| No password reset/MFA/SSO | Not required | No dead links |
| No ownership transfer; user deletion cascades docs | Simplicity | Documented behavior |
| No offline mode or localStorage | Would fake persistence | Honest error states; `beforeunload` warns, but a crash/forced close can lose unsaved in-memory edits |
| Light theme only | QA timebox | Tokens are theme-ready; documented |
| Markdown subset only; HTML treated as text | Safe, deterministic conversion | Exact mapping documented |
| Inline font-size control absent; headings provide size variation | Practical scope | H1–H3 in toolbar |
| Links not insertable via toolbar | Not required; imported links supported | No dead control; documented |
| No automated E2E browser tests | Timebox; manual smoke + integration RLS cover highest risk | Documented manual checklist |
| Integration tests require Docker/local Supabase | Environment limitation | Skips explicitly; manual verification recorded |
| No idempotency key on create/import | Duplicate-click prevention only | Retry may create a second doc; user can delete |
| Timestamps experienced as absolute until client mounts | Hydration safety | Absolute fallback always present |

---

## 21. Required Submission Deliverables

| Deliverable | Required content | Status at spec time |
|---|---|---|
| `PROJECT_SPEC.md` | This document | Authored (v1.1, security-audited) |
| `README.md` | Setup, env names, Supabase/migrations, tests, run commands, formats/size limit, deployed URL, demo access | Not started |
| `ARCHITECTURE.md` | Stack, directory map, data flow, schema/RLS, authorization matrix, tradeoffs | Not started |
| `AI_WORKFLOW.md` | Tools/models used, task breakdown, material AI contributions, rejected/modified output, verification performed | Not started |
| `SUBMISSION.md` | Exact inventory with status (complete/partial/not implemented), links, test results, known issues, demo credentials | Not started |
| `WALKTHROUGH.txt` | Video URL + 3–5 minute script/timestamps | Not started (populate after recording) |
| Source code | Next.js app, Supabase migrations, seed script | Not started |
| Automated tests | Unit + RLS integration suites | Not started |
| Screenshots / GIF | Dashboard, editor, share dialog; `docs/` | Not started |
| Live URL | Vercel deployment + demo access instructions | Not started (external prerequisite) |
| Walkthrough video | 3–5 minutes covering required flows | Not started |

SUBMISSION.md must distinguish completed, partial, and unimplemented features and include actual command results. No deliverable may claim deployment or tests that were not verified.

### 21.1 Walkthrough outline (3–5 minutes)

1. (0:00–0:20) Product + live URL.
2. (0:20–1:00) Login, dashboard, owned vs shared, create, rename.
3. (1:00–2:00) Format text, autosave, refresh persistence, reopen.
4. (2:00–2:30) Import `.md` (and show one validation error).
5. (2:30–4:00) Share as editor/viewer; switch accounts; demonstrate editor content-only and viewer read-only; unrelated user denied.
6. (4:00–4:30) Mobile view; error/conflict behavior.
7. (4:30–5:00) Architecture/security summary + honest limitations.

---

## 22. Definition of Done

A feature is done only when all applicable boxes are checked and verified.

### 22.1 Functional

- [ ] Login/signup/signout work; protected routes redirect correctly.
- [ ] Create, rename (owner), edit, save, reopen, delete (owner, confirmed) work.
- [ ] Bold, italic, underline, H1–H3, bulleted/numbered lists work and persist across refresh.
- [ ] `.txt` and `.md` import works; all documented error classes behave; 1 MiB limit enforced.
- [ ] Owner can grant viewer/editor, change permission, revoke; duplicates/self/unknown/unauthorized handled.
- [ ] Owned vs shared lists are visibly distinct with badges and timestamps.
- [ ] Viewers cannot write; editors cannot rename/delete/share; unrelated users get 404.
- [ ] Autosave status is truthful; conflicts never silently overwrite; pending saves are safe.
- [ ] Loading, empty, success, error, and conflict states exist on every relevant screen.
- [ ] Mobile layout works at 320/375/768/1024/1440 with no horizontal overflow.

### 22.2 Security

- [ ] RLS enabled on all tables; policies, triggers, and grants match Section 8.
- [ ] `auth.getUser()` used server-side; owner derived from `auth.uid()`.
- [ ] Strict Zod validation and TipTap whitelist reject malformed/oversized input.
- [ ] No HTML execution; links sanitized; import safe.
- [ ] Service-role key absent from runtime/browser.
- [ ] RLS integration tests (or documented manual equivalent) demonstrate the matrix.
- [ ] No secrets in repo, logs, screenshots, or docs.

### 22.3 Quality

- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes; actual output recorded.
- [ ] `npm run test:integration` passes or is explicitly reported as not run with reason.
- [ ] `npm run build` passes.
- [ ] Keyboard-only core flows work; focus visible; labels/ARIA verified.
- [ ] Reduced-motion and contrast requirements met.
- [ ] No dead buttons or fake functionality.

### 22.4 Delivery

- [ ] All Section 21 deliverables exist and are consistent with this spec.
- [ ] Deployed Vercel URL works; production RLS/env/auth verified.
- [ ] Demo accounts work; access instructions documented.
- [ ] Walkthrough video (3–5 min) recorded and URL populated in `WALKTHROUGH.txt`.
- [ ] Screenshots/GIF captured.
- [ ] SUBMISSION.md accurately lists complete/partial/unimplemented items and test results.
- [ ] Any deviation from this spec is documented in Section 23's change log.

---

## 23. Change Management and Source-of-Truth Rules

These rules are binding for all subsequent work.

1. **`PROJECT_SPEC.md` is the canonical product and technical contract.** README, ARCHITECTURE, code, tests, and SUBMISSION must agree with it.
2. **Every feature maps to an explicit requirement and acceptance criterion.** Work that cannot be mapped is out of scope or requires a spec change.
3. **Implementation correctness wins over convenience.** If implementation conflicts with the spec, fix the implementation unless the spec is demonstrably wrong or infeasible.
4. **Spec changes are documented before proceeding.** Record rationale, impact (DB/API/UI/tests), and revised acceptance criteria in a change-log entry below. Update affected sections and deliverables in the same task.
5. **No silent omissions.** Mandatory requirements are never dropped quietly; they are implemented, explicitly cut with rationale, or marked unimplemented in SUBMISSION.md.
6. **No unverified claims.** Never state that a feature, test, security control, or deployment works without executing and observing the result. "Not run" is an acceptable, required status.
7. **Smallest implementation that fully satisfies the requirement.** Avoid speculative abstraction, extra dependencies, and rewrites of working code.
8. **Stop adding features when the timebox threatens core functionality or delivery quality.** P2 never precedes P0/P1.
9. **Security review is mandatory for SQL/RLS/import changes.** Adversarial cases in Section 16.8 must be considered and tested.
10. **Docs are part of Done.** A feature without README/architecture updates where behavior changed is not complete.
11. **Preserve existing work.** This repository started empty; future changes must not delete unrelated files or overwrite working code without reason.
12. **Commit discipline.** Do not commit secrets or `.env*` files (except examples). Commit messages describe what changed and why; do not commit generated build output.

### 23.1 Deviations log

| Date | Section | Change | Rationale | Impact | Verified |
|---|---|---|---|---|---|
| 2026-10-29 | — | Initial specification v1.0 | Assignment kickoff | None (baseline) | N/A |
| 2026-10-29 | 7.2, 8.2–8.9, 9.4, 10.4, 16.7–16.8, 17.2–17.3, 18.7, 20 | Removed public `lookup_user_by_email`; replaced lookup-then-insert with owner-only atomic `grant_document_share`; documented SQLSTATE mapping and residual owner probing | Prevent authenticated email enumeration; remove race; simplify sharing | DB/API/UI-hook/test contracts; no mandatory feature removed | Pending implementation and RLS verification |
| 2026-10-29 | 16.7, 19.1, 19.3–19.4, 20 | Disclosed that the DB validates JSON object/size but not the full TipTap schema; made RLS verification conditional on an available database | Avoid overstating DB validation; prevent fabricated verification | Security/tradeoff/testing wording; no feature removed | N/A (documentation) |

When deviating during implementation, add a row and update the relevant requirement text. If a change affects security or authorization, the integration tests must be updated in the same task.

---

## Appendix A — Quick reference

- **Default doc JSON:** `{"type":"doc","content":[{"type":"paragraph"}]}`
- **Autosave debounce:** 800 ms trailing, 4 s max wait; one in-flight request; revision-based conditional update.
- **File limit:** 1 MiB; `.txt`, `.md`; UTF-8.
- **Roles:** owner > editor > viewer; title/delete/share are owner-only.
- **Status codes:** 401 unauth, 403 forbidden, 404 not found/not visible, 409 revision/duplicate, 413 size, 415 type, 422 validation, 500 internal.
- **Required commands:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; integration when available.
- **Trust boundary:** browser → validated Route Handler → repository with verified user → RLS/triggers. The UI is never the security boundary.

