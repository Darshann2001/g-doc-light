import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function getApiUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Use service-role client for DB ops — queries already filter by userId
  const db = createAdminClient();
  return { supabase: db, user };
}

export function unauthorized() {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
    { status: 401 },
  );
}
