import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getDocument } from "@/lib/documents";
import { EditorLoader } from "@/components/editor-loader";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const document = await getDocument(supabase, id, user.id);
  return { title: document?.title ?? "Document" };
}

export default async function DocumentPage({ params }: PageProps) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const document = await getDocument(supabase, id, user.id);
  if (!document) notFound();
  return <EditorLoader document={document} />;
}
