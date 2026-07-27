"use client";

import { ChefHat } from "lucide-react";
import { StationScreen } from "@/components/kitchen/station-screen";

export default function KitchenPage() {
  return (
    <StationScreen
      title="Cuisine"
      subtitle="Commandes en direct"
      station="kitchen"
      icon={ChefHat}
    />
  );
}
