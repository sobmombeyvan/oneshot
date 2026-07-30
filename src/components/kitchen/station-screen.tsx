"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle, ChefHat, Timer, Printer, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, cn } from "@/lib/utils";
import type { Order, OrderItem } from "@/types/database";

interface KitchenOrder extends Order {
  order_items: (OrderItem & { product: { name: string } })[];
}

const STATUS_COLUMNS = [
  { key: "pending", label: "Nouvelles", color: "border-yellow-500/50" },
  { key: "preparing", label: "En préparation", color: "border-orange-500/50" },
  { key: "ready", label: "Prêtes", color: "border-emerald-500/50" },
] as const;

function OrderTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [createdAt]);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const isUrgent = mins >= 15;
  return (
    <span className={cn("flex items-center gap-1 text-xs font-mono", isUrgent ? "text-red-400" : "text-off-white/50")}>
      <Timer className="h-3 w-3" />
      {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
    </span>
  );
}

interface StationScreenProps {
  title: string;
  subtitle: string;
  station: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function StationScreen({ title, subtitle, station, icon: Icon }: StationScreenProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [ticket, setTicket] = useState<ReceiptData | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: [`${station}-orders`],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select(`
          *,
          order_items(*, product:products(name, category:categories(type)))
        `)
        .in("status", ["pending", "preparing", "ready"])
        .order("created_at", { ascending: true });

      return ((data ?? []) as KitchenOrder[]).map((order) => ({
        ...order,
        order_items: (order.order_items ?? []).filter((item) => {
          if (station === "kitchen") return item.station === "kitchen" || !item.station;
          return item.station === station;
        }),
      })).filter((order) => order.order_items.length > 0);
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`${station}-realtime`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: [`${station}-orders`] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        queryClient.invalidateQueries({ queryKey: [`${station}-orders`] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, queryClient, station]);

  const updateStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
      if (error) throw error;

      if (status === "completed") {
        const { data: order } = await supabase
          .from("orders")
          .select("table_id")
          .eq("id", orderId)
          .single();
        if (order?.table_id) {
          await supabase
            .from("restaurant_tables")
            .update({ status: "cleaning" })
            .eq("id", order.table_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${station}-orders`] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-tables"] });
      queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      toast.success("Statut mis à jour");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handlePrintTicket = (order: KitchenOrder) => {
    const receiptData: ReceiptData = {
      title: `Ticket ${station}`,
      orderId: order.id,
      tableNumber: order.table_number,
      createdAt: order.created_at,
      station,
      items: order.order_items.map((i) => ({
        name: i.product?.name ?? "Article",
        quantity: i.quantity,
        price: 0,
      })),
      subtotal: 0,
      tax: 0,
      total: 0,
      notes: order.notes,
    };
    setTicket(receiptData);
    void printReceipt(receiptData);
  };

  return (
    <div className="min-h-screen">
      <Header title={title} subtitle={subtitle} />
      {ticket && <ReceiptPrintView data={ticket} />}

      <div className="p-4 lg:p-6 no-print">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-smoked-brown/30 bg-charcoal/40 px-4 py-3">
          <p className="text-sm text-off-white/70">
            Les commandes viennent du <strong className="text-primary">POS</strong>, du{" "}
            <strong className="text-primary">menu public</strong> ou des{" "}
            <strong className="text-primary">tablettes</strong>, puis apparaissent ici.
          </p>
          <Button asChild size="sm">
            <Link href="/pos">
              <ShoppingCart className="h-4 w-4" /> Nouvelle commande
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 [@media(min-width:1024px)_and_(min-aspect-ratio:5/4)]:grid-cols-3 gap-4 lg:gap-6">
          {STATUS_COLUMNS.map((col) => {
            const colOrders = orders.filter((o) => o.status === col.key);
            return (
              <div key={col.key} className="space-y-4">
                <div className={cn("flex items-center gap-2 pb-3 border-b-2", col.color)}>
                  <Icon className="h-5 w-5 text-primary" />
                  <h2 className="font-[family-name:var(--font-cinzel)] font-bold">{col.label}</h2>
                  <Badge variant="secondary">{colOrders.length}</Badge>
                </div>

                <AnimatePresence>
                  {colOrders.map((order) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      layout
                    >
                      <Card className={cn("border-l-4", col.color)}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-lg">Table {order.table_number ?? "—"}</p>
                                {(order.notes?.toLowerCase().includes("tablette") ||
                                  order.notes?.toLowerCase().includes("menu public")) && (
                                  <Badge variant="default">
                                    {order.notes?.toLowerCase().includes("menu public")
                                      ? "Menu public"
                                      : "Tablette"}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-off-white/40">#{order.id.slice(0, 8).toUpperCase()} · {formatDateTime(order.created_at)}</p>
                            </div>
                            <OrderTimer createdAt={order.created_at} />
                          </div>

                          <ul className="space-y-2 mb-4">
                            {order.order_items.map((item) => (
                              <li key={item.id} className="flex justify-between text-sm">
                                <span className="text-off-white/80">{item.product?.name}</span>
                                <span className="font-bold text-primary">×{item.quantity}</span>
                              </li>
                            ))}
                          </ul>

                          <div className="flex gap-2 mb-2">
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handlePrintTicket(order)}>
                              <Printer className="h-4 w-4" /> Ticket
                            </Button>
                          </div>

                          {col.key === "pending" && (
                            <Button className="w-full" onClick={() => updateStatus.mutate({ orderId: order.id, status: "preparing" })}>
                              <ChefHat className="h-4 w-4" /> Commencer
                            </Button>
                          )}
                          {col.key === "preparing" && (
                            <Button className="w-full" variant="outline" onClick={() => updateStatus.mutate({ orderId: order.id, status: "ready" })}>
                              <CheckCircle className="h-4 w-4" /> Marquer prêt
                            </Button>
                          )}
                          {col.key === "ready" && (
                            <Button className="w-full" onClick={() => updateStatus.mutate({ orderId: order.id, status: "completed" })}>
                              <Clock className="h-4 w-4" /> Servi & terminer
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {colOrders.length === 0 && (
                  <div className="text-center text-off-white/30 py-8 text-sm space-y-2">
                    <p>Aucune commande</p>
                    {col.key === "pending" && (
                      <Button asChild variant="ghost" size="sm">
                        <Link href="/pos">Créer au POS →</Link>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
