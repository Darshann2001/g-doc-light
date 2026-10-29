import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { JSONContent } from "@tiptap/core";
import { ApiError } from "@/lib/errors";
import type { AccessRole, Collaborator, DocumentList, DocumentRecord, DocumentSummary, Permission } from "@/lib/utils";
import { normalizeContent } from "@/lib/utils";
import { parseContent, parseEmail, parsePermission, parseRevision, parseTitle } from "@/lib/validation";

type Client = SupabaseClient<Database>;
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

const SUMMARY_COLUMNS = "id,title,revision,created_at,updated_at";
const PAGE_SIZE = 100;

function toSummary(row: Pick<DocumentRow, "id" | "title" | "revision" | "created_at" | "updated_at">, role: AccessRole): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    accessRole: role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toRecord(row: DocumentRow, role: AccessRole): DocumentRecord {
  return {
    ...toSummary(row, role),
    ownerId: row.owner_id,
    content: normalizeContent(row.content as JSONContent),
  };
}

export async function listDocuments(supabase: Client, userId: string): Promise<DocumentList> {
  const [ownedResult, sharesResult] = await Promise.all([
    supabase
      .from("documents")
      .select(SUMMARY_COLUMNS)
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(PAGE_SIZE + 1),
    supabase
      .from("document_shares")
      .select("document_id,permission")
      .eq("user_id", userId)
      .limit(PAGE_SIZE + 1),
  ]);

  if (ownedResult.error) throw ownedResult.error;
  if (sharesResult.error) throw sharesResult.error;

  const ownedRows = ownedResult.data ?? [];
  const owned = ownedRows.slice(0, PAGE_SIZE).map((row) => toSummary(row, "owner"));
  const shareRows = sharesResult.data ?? [];

  let shared: DocumentSummary[] = [];
  let sharedTruncated = shareRows.length > PAGE_SIZE;

  if (shareRows.length > 0) {
    const permissions = new Map(shareRows.map((row) => [row.document_id, row.permission as Permission]));
    const ids = [...permissions.keys()].slice(0, 500);
    const { data, error } = await supabase
      .from("documents")
      .select(SUMMARY_COLUMNS)
      .in("id", ids)
      .order("updated_at", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (error) throw error;
    const rows = data ?? [];
    sharedTruncated ||= rows.length > PAGE_SIZE;
    shared = rows.slice(0, PAGE_SIZE).map((row) => toSummary(row, permissions.get(row.id) ?? "viewer"));
  }

  return {
    owned,
    shared,
    truncated: { owned: ownedRows.length > PAGE_SIZE, shared: sharedTruncated },
  };
}

export async function getDocument(supabase: Client, documentId: string, userId: string): Promise<DocumentRecord | null> {
  const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (data.owner_id === userId) return toRecord(data, "owner");

  const { data: share, error: shareError } = await supabase
    .from("document_shares")
    .select("permission")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (shareError) throw shareError;
  if (!share) return null;

  return toRecord(data, share.permission as Permission);
}

export async function createDocument(supabase: Client, userId: string, titleInput: unknown, contentInput: unknown) {
  const title = parseTitle(titleInput);
  const content = parseContent(contentInput);
  const { data, error } = await supabase
    .from("documents")
    .insert({ owner_id: userId, title, content })
    .select("*")
    .single();
  if (error) throw error;
  return toRecord(data, "owner");
}

export async function updateDocumentContent(
  supabase: Client,
  documentId: string,
  baseRevisionInput: unknown,
  contentInput: unknown,
  titleInput?: unknown,
) {
  const baseRevision = parseRevision(baseRevisionInput);
  const content = parseContent(contentInput);
  const title = titleInput === undefined ? undefined : parseTitle(titleInput);

  const payload: Database["public"]["Tables"]["documents"]["Update"] = { content };
  if (title !== undefined) payload.title = title;

  const { data, error } = await supabase
    .from("documents")
    .update(payload)
    .eq("id", documentId)
    .eq("revision", baseRevision)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(409, "REVISION_CONFLICT", "This document changed elsewhere. Reload before saving.");
  return data;
}

export async function renameDocument(supabase: Client, documentId: string, userId: string, titleInput: unknown) {
  const title = parseTitle(titleInput);
  const { data, error } = await supabase
    .from("documents")
    .update({ title })
    .eq("id", documentId)
    .eq("owner_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "NOT_FOUND", "Document not found.");
  return toRecord(data, "owner");
}

export async function deleteDocument(supabase: Client, documentId: string, userId: string) {
  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("owner_id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new ApiError(404, "NOT_FOUND", "Document not found.");
}

export async function listCollaborators(supabase: Client, documentId: string): Promise<Collaborator[]> {
  const { data, error } = await supabase.rpc("list_document_collaborators", { p_document_id: documentId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name ?? "",
    permission: row.permission as Permission,
    createdAt: row.created_at,
  }));
}

export async function grantShare(supabase: Client, documentId: string, emailInput: unknown, permissionInput: unknown) {
  const email = parseEmail(emailInput);
  const permission = parsePermission(permissionInput);
  const { data, error } = await supabase.rpc("grant_document_share", {
    p_document_id: documentId,
    p_email: email,
    p_permission: permission,
  });
  if (error) throw error;
  return data ?? [];
}

export async function updateShare(
  supabase: Client,
  documentId: string,
  userId: string,
  permissionInput: unknown,
) {
  const permission = parsePermission(permissionInput);
  const { data, error } = await supabase
    .from("document_shares")
    .update({ permission })
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "NOT_FOUND", "Collaborator not found.");
}

export async function removeShare(supabase: Client, documentId: string, userId: string) {
  const { data, error } = await supabase
    .from("document_shares")
    .delete()
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new ApiError(404, "NOT_FOUND", "Collaborator not found.");
}
