import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const email = user.email ?? "Account";
  const initial = email.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-[-0.011em]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
              A
            </span>
            Ajaia Docs
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:block">{email}</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initial}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
