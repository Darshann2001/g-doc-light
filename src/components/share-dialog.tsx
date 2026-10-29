"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Modal } from "@/components/modal";
import type { Collaborator, Permission } from "@/lib/utils";

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? "Something went wrong. Please try again.";
}

export function ShareDialog({
  open,
  onClose,
  documentId,
  documentTitle,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
}) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<Permission>("editor");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/shares`, { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as { collaborators: Collaborator[] };
      setCollaborators(body.collaborators);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load collaborators.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  async function addCollaborator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("add");
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, permission }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setEmail("");
      await load();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Could not add that person.");
    } finally {
      setBusy(null);
    }
  }

  async function changePermission(userId: string, nextPermission: string) {
    setBusy(userId);
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/shares/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permission: nextPermission }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await load();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Could not update access.");
    } finally {
      setBusy(null);
    }
  }

  async function removeCollaborator(userId: string) {
    if (!window.confirm("Remove this person's access?")) return;
    setBusy(userId);
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/shares/${userId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorMessage(response));
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove access.");
    } finally {
      setBusy(null);
    }
  }

  function handleClose() {
    setEmail("");
    setError("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Share document"
      description={documentTitle}
      width="max-w-lg"
      footer={
        <Button variant="secondary" onClick={handleClose}>
          Done
        </Button>
      }
    >
      <form onSubmit={addCollaborator} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="share-email">
          Invite by email
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="share-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm placeholder:text-subtle-foreground"
          />
          <select
            aria-label="Permission"
            value={permission}
            onChange={(event) => setPermission(event.target.value as Permission)}
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <Button type="submit" disabled={busy === "add"}>
            {busy === "add" ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle-foreground">People with access</h3>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : collaborators.length === 0 ? (
          <p className="mt-3 rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">
            Only you have access right now.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {collaborators.map((person) => (
              <li key={person.userId} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                  {(person.displayName || person.email).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{person.displayName || person.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                </div>
                <select
                  aria-label={`Permission for ${person.email}`}
                  value={person.permission}
                  disabled={busy === person.userId}
                  onChange={(event) => void changePermission(person.userId, event.target.value)}
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button
                  type="button"
                  onClick={() => void removeCollaborator(person.userId)}
                  disabled={busy === person.userId}
                  className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
