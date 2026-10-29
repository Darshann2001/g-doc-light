"use client";

import dynamic from "next/dynamic";
import type { DocumentRecord } from "@/lib/utils";

const DocumentEditor = dynamic(
  () => import("@/components/editor").then((m) => m.DocumentEditor),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
        <div className="mt-4 h-10 animate-pulse rounded-xl bg-muted" />
        <div className="mt-6 h-[60vh] animate-pulse rounded-xl bg-muted" />
      </div>
    ),
  },
);

export function EditorLoader({ document }: { document: DocumentRecord }) {
  return <DocumentEditor document={document} />;
}
