import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { safeRedirect } from "@/lib/safe-redirect";
import { env } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirect(url.searchParams.get("next"));

  if (!code) return NextResponse.redirect(new URL("/login", request.url));

  const cookieStore = await cookies();
  const pending: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=callback", request.url));

  const response = NextResponse.redirect(new URL(next, request.url));
  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options as never));
  return response;
}
