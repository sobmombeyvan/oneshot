import { Suspense } from "react";
import ClientMenuPage from "./menu-client";

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black text-off-white/60">
          Chargement du menu...
        </div>
      }
    >
      <ClientMenuPage />
    </Suspense>
  );
}
