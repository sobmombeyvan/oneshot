"use client";

import { UtensilsCrossed } from "lucide-react";
import { BRAND } from "@/lib/constants";
import { buildTableOptions } from "@/lib/menu";
import { cn } from "@/lib/utils";
import type { RestaurantTable } from "@/types/database";

interface TablePickerProps {
  tables: RestaurantTable[];
  onSelect: (tableNumber: number) => void;
  title?: string;
  subtitle?: string;
  className?: string;
  footer?: React.ReactNode;
}

export function TablePicker({
  tables,
  onSelect,
  title = BRAND.name,
  subtitle = "Choisissez votre table pour commander",
  className,
  footer,
}: TablePickerProps) {
  const options = buildTableOptions(tables);

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-black text-off-white",
        className
      )}
    >
      <UtensilsCrossed className="h-12 w-12 text-primary" />
      <div className="text-center space-y-2">
        <h1 className="font-[family-name:var(--font-cinzel)] text-3xl sm:text-4xl text-primary tracking-wide">
          {title}
        </h1>
        <p className="text-sm sm:text-base text-off-white/50">{subtitle}</p>
      </div>

      <div className="w-full max-w-xl">
        <p className="text-center text-xs uppercase tracking-widest text-off-white/35 mb-4">
          20 tables disponibles
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 sm:gap-3">
          {options.map((table) => (
            <button
              key={table.id}
              type="button"
              onClick={() => onSelect(table.number)}
              className="aspect-square rounded-2xl border border-smoked-brown/40 bg-charcoal/60 flex flex-col items-center justify-center gap-0.5 hover:border-primary hover:bg-primary/10 active:scale-[0.97] transition"
            >
              <span className="text-[10px] uppercase tracking-wide text-off-white/40">Table</span>
              <span className="text-xl sm:text-2xl font-bold text-primary">{table.number}</span>
            </button>
          ))}
        </div>
      </div>

      {footer}
    </div>
  );
}
