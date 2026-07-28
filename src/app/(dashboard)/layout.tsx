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
    <div className="flex min-h-dvh bg-black square:min-h-0 square:h-dvh">
      <Sidebar profile={profile} />
      <main className="flex-1 min-h-dvh min-w-0 overflow-x-hidden square:min-h-0 square:h-dvh square:overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
