import { NextResponse } from "next/server";
import { getApiUser, unauthorized } from "@/lib/api";
import { grantShare, listCollaborators } from "@/lib/documents";
import { errorResponse } from "@/lib/errors";
import { isRecord, parseUuid } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();
    const id = parseUuid((await params).id);
    return NextResponse.json({ collaborators: await listCollaborators(supabase, id, user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();
    const id = parseUuid((await params).id);

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

    const rows = await grantShare(supabase, id, user.id, body.email, body.permission);
    return NextResponse.json({ collaborator: rows[0] ?? null }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
