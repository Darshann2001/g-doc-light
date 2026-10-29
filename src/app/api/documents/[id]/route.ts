import { NextResponse } from "next/server";
import { getApiUser, unauthorized } from "@/lib/api";
import { deleteDocument, getDocument, renameDocument, updateDocumentContent } from "@/lib/documents";
import { errorResponse, ApiError } from "@/lib/errors";
import { parseUuid, isRecord } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();
    const id = parseUuid((await params).id);
    const document = await getDocument(supabase, id, user.id);
    if (!document) throw new ApiError(404, "NOT_FOUND", "Document not found.");
    return NextResponse.json({ document });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();
    const id = parseUuid((await params).id);

    const existing = await getDocument(supabase, id, user.id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Document not found.");
    if (existing.accessRole === "viewer") throw new ApiError(403, "VIEW_ONLY", "You have view-only access.");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(422, "VALIDATION_ERROR", "Send a valid JSON body.");
    }
    if (!isRecord(body)) throw new ApiError(422, "VALIDATION_ERROR", "Send a valid JSON object.");
    if (existing.accessRole !== "owner" && body.title !== undefined) {
      throw new ApiError(403, "FORBIDDEN", "Only the owner can rename this document.");
    }

    // Title-only rename from dashboard (no content, no baseRevision)
    if (body.content === undefined) {
      if (body.title === undefined) throw new ApiError(422, "VALIDATION_ERROR", "Provide content or title.");
      const updated = await renameDocument(supabase, id, user.id, body.title);
      return NextResponse.json({ document: updated });
    }

    const row = await updateDocumentContent(supabase, id, body.baseRevision, body.content, body.title);
    const role = existing.accessRole;
    return NextResponse.json({
      document: {
        id: row.id,
        title: row.title,
        revision: row.revision,
        accessRole: role,
        ownerId: row.owner_id,
        content: row.content,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();
    const id = parseUuid((await params).id);
    const existing = await getDocument(supabase, id, user.id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Document not found.");
    if (existing.accessRole !== "owner") throw new ApiError(403, "FORBIDDEN", "Only the owner can delete this document.");
    await deleteDocument(supabase, id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
