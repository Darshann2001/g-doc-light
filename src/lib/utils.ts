import type { JSONContent } from "@tiptap/core";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

export function relativeTime(value: string): string {
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - date) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(value);
}

export type AccessRole = "owner" | "editor" | "viewer";
export type Permission = "editor" | "viewer";

export interface DocumentSummary {
  id: string;
  title: string;
  accessRole: AccessRole;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord extends DocumentSummary {
  ownerId: string;
  content: JSONContent;
}

export interface DocumentList {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
  truncated: { owned: boolean; shared: boolean };
}

export interface Collaborator {
  userId: string;
  email: string;
  displayName: string;
  permission: Permission;
  createdAt: string;
}

export function emptyDocument(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function normalizeContent(value: JSONContent): JSONContent {
  if (!value || value.type !== "doc" || !Array.isArray(value.content)) return emptyDocument();
  if (value.content.length === 0) return emptyDocument();
  return value;
}
