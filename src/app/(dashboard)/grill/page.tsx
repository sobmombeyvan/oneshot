"use client";

import { Flame } from "lucide-react";
import { StationScreen } from "@/components/kitchen/station-screen";

export default function GrillPage() {
  return (
    <StationScreen
      title="Grill"
      subtitle="Commandes grill en direct"
      station="grill"
      icon={Flame}
    />
  );
}
