"use client";

import { ChefHat } from "lucide-react";
import { StationScreen } from "@/components/kitchen/station-screen";

export default function KitchenPage() {
  return (
    <StationScreen
      title="Cuisine"
      subtitle="Cuisine & grill — une seule file"
      station="kitchen"
      icon={ChefHat}
    />
  );
}
