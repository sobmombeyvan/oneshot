"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, CheckCircle, XCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ORDER_STATUSES } from "@/lib/constants";
import type { Order, OrderItem, OrderStatus } from "@/types/database";

type OrderRow = Order & {
  order_items?: (OrderItem & { product?: { name: string } })[];
};

export default function OrdersPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["all-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, cashier:profiles(fullname), order_items(*, product:products(name))")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as OrderRow[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
      if (status === "completed" || status === "cancelled") {
        const { data: order } = await supabase.from("orders").select("table_id").eq("id", id).single();
        if (order?.table_id) {
          await supabase
            .from("restaurant_tables")
            .update({ status: status === "completed" ? "cleaning" : "available" })
            .eq("id", order.table_id);
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-tables"] });
      setSelected((prev) => (prev && prev.id === vars.id ? { ...prev, status: vars.status } : prev));
      toast.success("Commande mise à jour");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const getStatusBadge = (status: string) => {
    const s = ORDER_STATUSES.find((o) => o.value === status);
    return s ? <span className={`px-2 py-0.5 rounded-lg text-xs ${s.color}`}>{s.label}</span> : status;
  };

  const handlePrint = (order: OrderRow) => {
    const items = (order.order_items ?? []).map((i) => ({
      name: i.product?.name ?? "Article",
      quantity: i.quantity,
      price: i.price,
    }));
    setReceipt({
      title: "Bon de commande",
      orderId: order.id,
      tableNumber: order.table_number,
      createdAt: order.created_at,
      items,
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      paymentMethod: order.payment_method,
      notes: order.notes,
    });
    printReceipt();
  };

  return (
    <div>
      <Header title="Commandes" subtitle="Historique & suivi des commandes" />
      {receipt && <ReceiptPrintView data={receipt} />}

      <div className="p-6 lg:p-8 space-y-4 no-print">
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/pos">
              <Plus className="h-4 w-4" /> Nouvelle commande
            </Link>
          </Button>
        </div>

        {orders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <p className="text-off-white/40">Aucune commande</p>
              <Button asChild>
                <Link href="/pos">Créer au Point de Vente</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold">Table {order.table_number ?? "—"}</p>
                    {getStatusBadge(order.status)}
                    <Badge variant="secondary">#{order.id.slice(0, 8).toUpperCase()}</Badge>
                  </div>
                  <p className="text-xs text-off-white/40 mt-1">{formatDateTime(order.created_at)}</p>
                  <p className="text-xs text-off-white/50 mt-1">
                    {(order.order_items ?? []).map((i) => `${i.product?.name}×${i.quantity}`).join(", ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <p className="text-lg font-bold text-primary">{formatCurrency(order.total)}</p>
                    <p className="text-xs text-off-white/40 capitalize">
                      {order.payment_method?.replace("_", " ") ?? "—"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelected(order)} title="Détails">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handlePrint(order)} title="Imprimer">
                    <Printer className="h-4 w-4" />
                  </Button>
                  {order.status !== "completed" && order.status !== "cancelled" && (
                    <Button
                      size="sm"
                      onClick={() => updateStatus.mutate({ id: order.id, status: "completed" })}
                    >
                      <CheckCircle className="h-4 w-4" /> Terminer
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="no-print max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Commande #{selected?.id.slice(0, 8).toUpperCase()} — Table {selected?.table_number ?? "—"}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getStatusBadge(selected.status)}
                <span className="text-xs text-off-white/40">{formatDateTime(selected.created_at)}</span>
              </div>
              <ul className="space-y-2">
                {(selected.order_items ?? []).map((item) => (
                  <li key={item.id} className="flex justify-between text-sm border-b border-smoked-brown/20 pb-2">
                    <span>{item.product?.name} ×{item.quantity}</span>
                    <span className="text-primary">{formatCurrency(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(selected.total)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => handlePrint(selected)}>
                  <Printer className="h-4 w-4" /> Imprimer
                </Button>
                {selected.status !== "completed" && (
                  <Button onClick={() => updateStatus.mutate({ id: selected.id, status: "completed" })}>
                    <CheckCircle className="h-4 w-4" /> Terminer
                  </Button>
                )}
                {selected.status !== "cancelled" && selected.status !== "completed" && (
                  <Button
                    variant="destructive"
                    onClick={() => updateStatus.mutate({ id: selected.id, status: "cancelled" })}
                  >
                    <XCircle className="h-4 w-4" /> Annuler
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
