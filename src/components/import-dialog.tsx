"use client";

import { useRef, useState } from "react";
import { Button, Modal } from "@/components/modal";
import type { DocumentRecord } from "@/lib/utils";

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? "Import failed. Please try again.";
}

export function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (document: DocumentRecord) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function close() {
    if (pending) return;
    setFile(null);
    setError("");
    onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a .txt or .md file first.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/import", { method: "POST", body: form });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as { document: DocumentRecord };
      setFile(null);
      onImported(body.document);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import a document"
      description="Turn a plain text or Markdown file into an editable document."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="import-form" disabled={pending || !file}>
            {pending ? "Importing…" : "Import"}
          </Button>
        </>
      }
    >
      <form id="import-form" onSubmit={submit}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-input bg-muted/50 px-4 py-8 text-center transition-colors hover:bg-accent"
        >
          <span className="text-sm font-medium">{file ? file.name : "Choose a .txt or .md file"}</span>
          <span className="mt-1 text-xs text-muted-foreground">Maximum 1 MiB · UTF-8 text</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          className="sr-only"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError("");
          }}
        />
        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
