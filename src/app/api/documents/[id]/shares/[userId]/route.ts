import { NextResponse } from "next/server";
import { getApiUser, unauthorized } from "@/lib/api";
import { removeShare, updateShare } from "@/lib/documents";
import { errorResponse } from "@/lib/errors";
import { isRecord, parseUuid } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();
    const { id, userId } = await params;
    const documentId = parseUuid(id);
    const collaboratorId = parseUuid(userId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Send a valid JSON body." } },
        { status: 422 },
      );
    }
    if (!isRecord(body)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Send a valid JSON object." } },
        { status: 422 },
      );
    }

    await updateShare(supabase, documentId, collaboratorId, body.permission);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();
    const { id, userId } = await params;
    const documentId = parseUuid(id);
    const collaboratorId = parseUuid(userId);
    await removeShare(supabase, documentId, collaboratorId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
