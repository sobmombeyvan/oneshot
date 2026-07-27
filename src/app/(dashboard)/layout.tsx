import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar profile={profile} />
      <main className="flex-1 min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
