import type { JSONContent } from "@tiptap/core";
import type { Permission } from "@/lib/utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ValidationError("Invalid document id.");
  return value;
}

export function sanitizeTitle(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function parseTitle(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("Title is required.");
  const title = sanitizeTitle(value);
  if (!title) throw new ValidationError("Title is required.");
  if (value.trim().length > 200) throw new ValidationError("Title must be 200 characters or fewer.");
  return title;
}

export function parseContent(value: unknown): JSONContent {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) {
    throw new ValidationError("Content must be a TipTap document.");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ValidationError("Content must be valid JSON.");
  }
  if (new TextEncoder().encode(serialized).length > MAX_CONTENT_BYTES) {
    throw new ValidationError("Content must be 2 MiB or smaller.");
  }
  return value as JSONContent;
}

export function parseRevision(value: unknown): number {
  const revision = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(revision) || revision < 1) throw new ValidationError("baseRevision is required.");
  return revision;
}

export function parseEmail(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("Email is required.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new ValidationError("Enter a valid email address.");
  return email;
}

export function parsePermission(value: unknown): Permission {
  if (value !== "editor" && value !== "viewer") throw new ValidationError("Permission must be editor or viewer.");
  return value;
}

export function parseTitleOnly(value: unknown): string {
  return parseTitle(value);
}
