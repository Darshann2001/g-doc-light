"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ArrowLeft,
  Bold,
  Download,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Share2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { ShareDialog } from "@/components/share-dialog";
import { Button } from "@/components/modal";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/lib/utils";
import { downloadMarkdown } from "@/lib/markdown-export";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

const HEADING_LABELS: Record<string, string> = {
  p: "Paragraph",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
};

// Extracted outside component to satisfy lint (no re-creation on render)
function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focus
        onClick();
      }}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
        active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function activeBlock(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "p";
}

export function DocumentEditor({ document: doc }: { document: DocumentRecord }) {
  const isOwner = doc.accessRole === "owner";
  const canEdit = doc.accessRole === "owner" || doc.accessRole === "editor";

  const [title, setTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [shareOpen, setShareOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const titleRef = useRef(doc.title);
  const lastRevisionRef = useRef(doc.revision);
  const inFlightRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSaveRef = useRef<() => Promise<void>>(async () => {});

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: doc.content,
    editable: canEdit,
    editorProps: { attributes: { class: "tiptap" } },
    onUpdate() {
      scheduleSave();
    },
  });

  // Keep doSaveRef current after every render so timer closures use fresh values.
  // useLayoutEffect runs synchronously after DOM mutations, before the browser paints,
  // ensuring the ref is updated before any pending timers fire.
  useLayoutEffect(() => {
    doSaveRef.current = async () => {
      if (!editor || inFlightRef.current) return;
      inFlightRef.current = true;
      setSaveState("saving");

      const payload: Record<string, unknown> = {
        baseRevision: lastRevisionRef.current,
        content: editor.getJSON(),
      };
      if (isOwner) payload.title = titleRef.current;

      try {
        const response = await fetch(`/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (response.status === 409) {
          setSaveState("conflict");
          return;
        }
        if (!response.ok) throw new Error("Save failed");

        const body = (await response.json()) as { document: { revision: number } };
        lastRevisionRef.current = body.document.revision;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      } finally {
        inFlightRef.current = false;
      }
    };
  });

  function scheduleSave() {
    if (!canEdit) return;
    setSaveState("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void doSaveRef.current(), 1000);
  }

  function handleTitleChange(value: string) {
    titleRef.current = value;
    setTitle(value);
    scheduleSave();
  }

  function retrySave() {
    setSaveState("dirty");
    void doSaveRef.current();
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Close block dropdown on outside click
  useEffect(() => {
    if (!blockOpen) return;
    function onDown(e: MouseEvent) {
      if (!(e.target as Element).closest("[data-block-menu]")) setBlockOpen(false);
    }
    window.document.addEventListener("mousedown", onDown);
    return () => window.document.removeEventListener("mousedown", onDown);
  }, [blockOpen]);

  function setBlock(type: string) {
    if (!editor) return;
    setBlockOpen(false);
    if (type === "p") editor.chain().focus().setParagraph().run();
    else {
      const level = parseInt(type[1]) as 1 | 2 | 3;
      editor.chain().focus().setHeading({ level }).run();
    }
  }

  const currentBlock = editor ? activeBlock(editor) : "p";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="Back to documents"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </Link>

          <div className="min-w-0 flex-1">
            {isOwner ? (
              <input
                type="text"
                aria-label="Document title"
                value={title}
                maxLength={200}
                onChange={(e) => handleTitleChange(e.target.value)}
                onBlur={() => {
                  if (!title.trim()) {
                    titleRef.current = doc.title;
                    setTitle(doc.title);
                  }
                }}
                className="w-full truncate bg-transparent text-base font-semibold tracking-[-0.011em] outline-none placeholder:text-subtle-foreground"
                placeholder="Untitled document"
              />
            ) : (
              <h1 className="truncate text-base font-semibold tracking-[-0.011em]" title={doc.title}>
                {doc.title}
              </h1>
            )}
          </div>

          {doc.accessRole === "viewer" && (
            <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground sm:block">
              View only
            </span>
          )}
          {doc.accessRole === "editor" && (
            <span className="hidden shrink-0 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success sm:block">
              Can edit
            </span>
          )}

          {canEdit && (
            <div role="status" aria-live="polite" className="flex shrink-0 items-center gap-1.5 text-xs">
              {saveState === "saving" && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 size={13} className="animate-spin" />
                  <span className="hidden sm:inline">Saving…</span>
                </span>
              )}
              {saveState === "saved" && (
                <span className="flex items-center gap-1 text-success">
                  <CheckCircle2 size={13} />
                  <span className="hidden sm:inline">Saved</span>
                </span>
              )}
              {saveState === "error" && (
                <button
                  type="button"
                  onClick={retrySave}
                  className="flex items-center gap-1 text-destructive hover:underline"
                >
                  <AlertCircle size={13} />
                  <span className="hidden sm:inline">Error · Retry</span>
                </button>
              )}
              {saveState === "conflict" && (
                <span className="flex items-center gap-1 text-warning">
                  <AlertCircle size={13} />
                  <span className="hidden sm:inline">Out of sync</span>
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            aria-label="Export as Markdown"
            title="Export as Markdown"
            onClick={() => editor && downloadMarkdown(title, editor.getJSON())}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Download size={16} />
          </button>

          {isOwner && (
            <Button
              variant="secondary"
              className="hidden shrink-0 sm:flex"
              onClick={() => setShareOpen(true)}
            >
              <Share2 size={15} className="mr-1.5" />
              Share
            </Button>
          )}
        </div>
      </header>

      {saveState === "conflict" && (
        <div className="border-b border-warning-soft bg-warning-soft px-4 py-2 text-center text-xs text-warning">
          This document changed elsewhere. Refresh to load the latest version, or keep editing to overwrite.
        </div>
      )}

      {/* Toolbar */}
      {canEdit && editor && (
        <div className="sticky top-14 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-11 max-w-6xl items-center px-4 sm:px-6 lg:px-8">

            {/* Block dropdown — outside overflow container so it isn't clipped */}
            <div className="relative shrink-0" data-block-menu>
              <button
                type="button"
                aria-label="Block type"
                aria-expanded={blockOpen}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setBlockOpen((o) => !o);
                }}
                className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {HEADING_LABELS[currentBlock]}
                <ChevronDown size={12} />
              </button>
              {blockOpen && (
                <div
                  data-block-menu
                  className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-xl border border-border bg-card p-1 shadow-md"
                >
                  {(["p", "h1", "h2", "h3"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setBlock(type);
                      }}
                      className={cn(
                        "flex w-full items-center rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                        currentBlock === type && "bg-primary-soft text-primary font-medium",
                      )}
                    >
                      {HEADING_LABELS[type]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mx-1.5 h-5 w-px shrink-0 bg-border" aria-hidden />

            {/* Remaining buttons — scrollable on narrow screens */}
            <div className="flex items-center gap-0.5 overflow-x-auto">
              <div role="group" aria-label="History" className="flex shrink-0 items-center">
                <ToolbarButton
                  label="Undo"
                  disabled={!editor.can().undo()}
                  onClick={() => editor.chain().focus().undo().run()}
                >
                  <Undo2 size={15} />
                </ToolbarButton>
                <ToolbarButton
                  label="Redo"
                  disabled={!editor.can().redo()}
                  onClick={() => editor.chain().focus().redo().run()}
                >
                  <Redo2 size={15} />
                </ToolbarButton>
              </div>

              <div className="mx-1.5 h-5 w-px shrink-0 bg-border" aria-hidden />

              <div role="group" aria-label="Text formatting" className="flex shrink-0 items-center">
                <ToolbarButton
                  label="Bold"
                  active={editor.isActive("bold")}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                >
                  <Bold size={15} />
                </ToolbarButton>
                <ToolbarButton
                  label="Italic"
                  active={editor.isActive("italic")}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                  <Italic size={15} />
                </ToolbarButton>
                <ToolbarButton
                  label="Underline"
                  active={editor.isActive("underline")}
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                >
                  <UnderlineIcon size={15} />
                </ToolbarButton>
              </div>

              <div className="mx-1.5 h-5 w-px shrink-0 bg-border" aria-hidden />

              <div role="group" aria-label="Lists" className="flex shrink-0 items-center">
                <ToolbarButton
                  label="Bullet list"
                  active={editor.isActive("bulletList")}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                  <List size={15} />
                </ToolbarButton>
                <ToolbarButton
                  label="Numbered list"
                  active={editor.isActive("orderedList")}
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                  <ListOrdered size={15} />
                </ToolbarButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <div className="min-h-[calc(100dvh-220px)] rounded-xl border border-border bg-card px-5 py-8 shadow-xs sm:px-12 sm:py-10">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {isOwner && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          documentId={doc.id}
          documentTitle={title}
        />
      )}
    </div>
  );
}
