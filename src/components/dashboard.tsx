"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, MoreVertical, Pencil, Plus, Search, Share2, Trash2, Upload } from "lucide-react";
import { Button, Modal } from "@/components/modal";
import { ImportDialog } from "@/components/import-dialog";
import { ShareDialog } from "@/components/share-dialog";
import type { DocumentList, DocumentRecord, DocumentSummary } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? "Something went wrong. Please try again.";
}

function RoleBadge({ role }: { role: DocumentSummary["accessRole"] }) {
  const styles = {
    owner: "bg-primary-soft text-primary",
    editor: "bg-success-soft text-success",
    viewer: "bg-muted text-muted-foreground",
  };
  const labels = { owner: "Owner", editor: "Can edit", viewer: "Can view" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[role]}`}>{labels[role]}</span>;
}

function DocumentCard({
  document: doc,
  onRename,
  onShare,
  onDelete,
}: {
  document: DocumentSummary;
  onRename: (document: DocumentSummary) => void;
  onShare: (document: DocumentSummary) => void;
  onDelete: (document: DocumentSummary) => void;
}) {
  const isOwner = doc.accessRole === "owner";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
      {/* Thumbnail */}
      <Link href={`/documents/${doc.id}`} className="block bg-white">
        <div className="aspect-[3/4] overflow-hidden px-6 pt-6 pb-2">
          <div className="h-2 w-1/2 rounded-sm bg-gray-300/70" />
          <div className="mt-4 space-y-2">
            {[1, 1, 0.75, 1, 1, 0.6, 1, 0.85, 1, 1, 0.7, 1].map((w, i) => (
              <div key={i} className="h-1.5 rounded-sm bg-gray-200/80" style={{ width: `${w * 100}%` }} />
            ))}
          </div>
        </div>
      </Link>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <span className="shrink-0 text-primary">
          <FileText size={16} />
        </span>
        <Link href={`/documents/${doc.id}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{doc.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {!isOwner && <RoleBadge role={doc.accessRole} />}
            {isOwner && <>Opened {formatDate(doc.updatedAt)}</>}
          </p>
        </Link>
        {isOwner && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              aria-label="More options"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v); }}
              className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-1 w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onShare(doc); }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <Share2 size={14} /> Share
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(doc); }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <Pencil size={14} /> Rename
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(doc); }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Dashboard({ initial }: { initial: DocumentList }) {
  const router = useRouter();
  const [owned, setOwned] = useState(initial.owned);
  const [shared] = useState(initial.shared);
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");

  const [renameTarget, setRenameTarget] = useState<DocumentSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);

  const [shareTarget, setShareTarget] = useState<DocumentSummary | null>(null);

  const filteredOwned = useMemo(
    () => owned.filter((document) => document.title.toLowerCase().includes(query.trim().toLowerCase())),
    [owned, query],
  );
  const filteredShared = useMemo(
    () => shared.filter((document) => document.title.toLowerCase().includes(query.trim().toLowerCase())),
    [shared, query],
  );
  const total = owned.length + shared.length;

  async function createDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setActionError("");
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as { document: DocumentRecord };
      router.push(`/documents/${body.document.id}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not create document.");
      setPending(false);
    }
  }

  function openCreate() {
    setTitle("");
    setActionError("");
    setCreateOpen(true);
  }

  function openRename(document: DocumentSummary) {
    setRenameTarget(document);
    setRenameTitle(document.title);
    setActionError("");
  }

  async function renameDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget) return;
    setPending(true);
    setActionError("");
    try {
      const response = await fetch(`/api/documents/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: renameTitle }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as { document: DocumentRecord };
      setOwned((current) =>
        current.map((document) =>
          document.id === body.document.id ? { ...document, title: body.document.title } : document,
        ),
      );
      setRenameTarget(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not rename document.");
    } finally {
      setPending(false);
    }
  }

  async function deleteDocument() {
    if (!deleteTarget) return;
    setPending(true);
    setActionError("");
    try {
      const response = await fetch(`/api/documents/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorMessage(response));
      setOwned((current) => current.filter((document) => document.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete document.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.011em]">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0 ? "Your quiet place to write and collaborate." : `${total} document${total === 1 ? "" : "s"} across your workspace.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload size={16} className="mr-1.5" />
            Import
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-1.5" />
            New document
          </Button>
        </div>
      </div>

      <div className="relative mt-6 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents"
          aria-label="Search documents"
          className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-subtle-foreground"
        />
      </div>

      {total === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-input bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <FileText size={21} />
          </span>
          <h2 className="mt-4 text-base font-semibold">Start with a blank page</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Create a document or import a Markdown file. You can share it with a teammate in a click.
          </p>
          <Button className="mt-5" onClick={openCreate}>
            <Plus size={16} className="mr-1.5" />
            New document
          </Button>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your documents</h2>
              <span className="text-xs text-muted-foreground">{owned.length}</span>
            </div>
            {filteredOwned.length === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                {query ? "No owned documents match your search." : "No owned documents yet."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredOwned.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    onRename={openRename}
                    onShare={setShareTarget}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
            {initial.truncated.owned && !query ? (
              <p className="mt-2 text-xs text-muted-foreground">Showing the 100 most recently updated documents.</p>
            ) : null}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Shared with you</h2>
              <span className="text-xs text-muted-foreground">{shared.length}</span>
            </div>
            {filteredShared.length === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                {query ? "No shared documents match your search." : "Nothing has been shared with you yet."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredShared.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    onRename={openRename}
                    onShare={setShareTarget}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
            {initial.truncated.shared && !query ? (
              <p className="mt-2 text-xs text-muted-foreground">Showing the 100 most recently updated shared documents.</p>
            ) : null}
          </section>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => !pending && setCreateOpen(false)}
        title="New document"
        description="Give it a name. You can change it later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="create-form" disabled={pending || !title.trim()}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <form id="create-form" onSubmit={createDocument}>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="new-title">
            Title
          </label>
          <input
            id="new-title"
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled document"
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-subtle-foreground"
          />
          {actionError ? (
            <p role="alert" className="mt-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {actionError}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => !pending && setRenameTarget(null)}
        title="Rename document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="rename-form" disabled={pending || !renameTitle.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="rename-form" onSubmit={renameDocument}>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="rename-title">
            Title
          </label>
          <input
            id="rename-title"
            autoFocus
            required
            maxLength={200}
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
          />
          {actionError ? (
            <p role="alert" className="mt-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {actionError}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !pending && setDeleteTarget(null)}
        title="Delete document?"
        description={deleteTarget ? `“${deleteTarget.title}” will be permanently deleted.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void deleteDocument()} disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">This also removes access for everyone it was shared with.</p>
        {actionError ? (
          <p role="alert" className="mt-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
      </Modal>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(document) => {
          setImportOpen(false);
          setOwned((current) => [document, ...current]);
          router.push(`/documents/${document.id}`);
        }}
      />

      {shareTarget ? (
        <ShareDialog
          open
          onClose={() => setShareTarget(null)}
          documentId={shareTarget.id}
          documentTitle={shareTarget.title}
        />
      ) : null}
    </div>
  );
}
