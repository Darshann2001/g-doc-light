import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function getApiUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export function unauthorized() {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
    { status: 401 },
  );
}
