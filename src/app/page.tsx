import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { getDefaultRoute } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getProfile();
  if (profile) {
    redirect(getDefaultRoute(profile.role));
  }
  redirect("/login");
}
