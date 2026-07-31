"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Grill = Cuisine — keep URL for old bookmarks */
export default function GrillRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/kitchen");
  }, [router]);
  return (
    <div className="p-8 text-off-white/40">Redirection vers Cuisine…</div>
  );
}
