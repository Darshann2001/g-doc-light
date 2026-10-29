import { NextResponse } from "next/server";
import { ValidationError } from "@/lib/validation";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

const SQLSTATE_MAP: Record<string, { status: number; code: string; message: string }> = {
  "42501": { status: 403, code: "FORBIDDEN", message: "You do not have permission to do that." },
  P0002: { status: 404, code: "USER_NOT_FOUND", message: "No account found with that email." },
  P0001: { status: 422, code: "SELF_SHARE", message: "You already own this document." },
  "23505": { status: 409, code: "ALREADY_SHARED", message: "That person already has access." },
  "22023": { status: 422, code: "VALIDATION_ERROR", message: "The request was invalid." },
  "23514": { status: 422, code: "VALIDATION_ERROR", message: "The request was invalid." },
  PGRST116: { status: 404, code: "NOT_FOUND", message: "Document not found." },
};

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.message } }, { status: 422 });
  }
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (isSupabaseError(error) && error.code && SQLSTATE_MAP[error.code]) {
    const mapped = SQLSTATE_MAP[error.code];
    return NextResponse.json({ error: { code: mapped.code, message: mapped.message } }, { status: mapped.status });
  }
  console.error("Unhandled API error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

export function isSupabaseError(error: unknown): error is SupabaseErrorLike {
  return typeof error === "object" && error !== null && ("code" in error || "message" in error);
}
