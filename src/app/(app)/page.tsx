import { requireUser } from "@/lib/auth";
import { listDocuments } from "@/lib/documents";
import { Dashboard } from "@/components/dashboard";

export const metadata = { title: "Documents" };

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const documents = await listDocuments(supabase, user.id);
  return <Dashboard initial={documents} />;
}
