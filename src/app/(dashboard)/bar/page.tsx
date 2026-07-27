"use client";

import { Wine } from "lucide-react";
import { StationScreen } from "@/components/kitchen/station-screen";

export default function BarPage() {
  return (
    <StationScreen
      title="Bar"
      subtitle="Commandes bar en direct"
      station="bar"
      icon={Wine}
    />
  );
}
