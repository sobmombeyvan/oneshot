"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Package, Users, Truck, FileText, ClipboardList, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  product: Package, customer: Users, supplier: Truck,
  invoice: FileText, order: ClipboardList, reservation: Calendar,
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const { data: results = [] } = useQuery({
    queryKey: ["global-search", query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const items: { type: string; label: string; href: string }[] = [];

      const { data: products } = await supabase.from("products").select("id, name").ilike("name", `%${query}%`).limit(5);
      products?.forEach((p: { id: string; name: string }) => items.push({ type: "product", label: p.name, href: "/inventory" }));

      const { data: customers } = await supabase.from("customers").select("id, fullname").ilike("fullname", `%${query}%`).limit(5);
      customers?.forEach((c: { id: string; fullname: string }) => items.push({ type: "customer", label: c.fullname, href: "/customers" }));

      const { data: invoices } = await supabase.from("invoices").select("id, invoice_number").ilike("invoice_number", `%${query}%`).limit(5);
      invoices?.forEach((i: { id: string; invoice_number: string }) => items.push({ type: "invoice", label: i.invoice_number, href: "/invoices" }));

      return items;
    },
    enabled: query.length >= 2,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg bg-charcoal border border-smoked-brown/40 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
          <Input
            autoFocus
            placeholder="Recherche globale... (Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-14 pl-12 border-0 rounded-none bg-transparent text-base focus-visible:ring-0"
          />
        </div>
        {results.length > 0 && (
          <div className="border-t border-smoked-brown/30 max-h-64 overflow-y-auto">
            {results.map((r, i) => {
              const Icon = TYPE_ICONS[r.type] ?? Search;
              return (
                <button
                  key={i}
                  onClick={() => { router.push(r.href); setOpen(false); }}
                  className="flex items-center gap-3 w-full px-4 py-3 hover:bg-smoked-brown/20 transition-colors text-left"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm">{r.label}</span>
                  <span className="text-xs text-off-white/30 ml-auto capitalize">{r.type}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
