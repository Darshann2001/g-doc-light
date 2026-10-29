import { NextResponse } from "next/server";
import { getApiUser, unauthorized } from "@/lib/api";
import { errorResponse } from "@/lib/errors";
import { createDocument, listDocuments } from "@/lib/documents";
import { emptyDocument } from "@/lib/utils";
import { isRecord } from "@/lib/validation";

export async function GET() {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();
    return NextResponse.json(await listDocuments(supabase, user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();

    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 2.5 * 1024 * 1024) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Content must be 2 MiB or smaller." } },
        { status: 413 },
      );
    }

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

    const document = await createDocument(supabase, user.id, body.title, body.content ?? emptyDocument());
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
