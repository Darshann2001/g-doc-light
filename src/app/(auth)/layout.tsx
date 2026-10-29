export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
            A
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.011em] text-foreground">Ajaia Docs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Write clearly. Share simply.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
