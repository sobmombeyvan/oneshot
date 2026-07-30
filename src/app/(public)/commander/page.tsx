import { Suspense } from "react";
import PublicOrderClient from "./order-client";

export const metadata = {
  title: "Commander — ONE SHOT Lounge & Grill",
  description: "Consultez le menu et envoyez votre commande à la caisse",
};

export default function CommanderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black text-off-white/60">
          Chargement du menu...
        </div>
      }
    >
      <PublicOrderClient />
    </Suspense>
  );
}
