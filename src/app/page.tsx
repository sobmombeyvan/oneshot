import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { getDefaultRoute } from "@/lib/permissions";
import { isDemoMode } from "@/lib/demo/config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (isDemoMode()) {
    redirect("/dashboard");
  }

  const profile = await getProfile();
  if (profile) {
    redirect(getDefaultRoute(profile.role));
  }
  redirect("/login");
}
