import { NextResponse } from "next/server";
import { getApiUser, unauthorized } from "@/lib/api";
import { createDocument } from "@/lib/documents";
import { errorResponse } from "@/lib/errors";
import { parseImportedFile, IMPORT_LIMITS } from "@/lib/import";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getApiUser();
    if (!user) return unauthorized();

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: { code: "FILE_TOO_LARGE", message: "File must be 1 MiB or smaller." } },
        { status: 413 },
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Upload a .txt or .md file." } },
        { status: 422 },
      );
    }

    const keys = [...form.keys()];
    const file = form.get("file");
    if (keys.length !== 1 || keys[0] !== "file" || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Upload exactly one file field named file." } },
        { status: 422 },
      );
    }
    if (file.size > IMPORT_LIMITS.maxBytes) {
      return NextResponse.json(
        { error: { code: "FILE_TOO_LARGE", message: "File must be 1 MiB or smaller." } },
        { status: 413 },
      );
    }

    const imported = parseImportedFile(file.name, new Uint8Array(await file.arrayBuffer()));
    const document = await createDocument(supabase, user.id, imported.title, imported.content);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
