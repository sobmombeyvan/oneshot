"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Product, Purchase, Supplier } from "@/types/database";

export default function PurchasesPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "",
    product_id: "",
    quantity: 1,
    price: 0,
  });

  const { data: purchases = [], isLoading, isError } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("*, supplier:suppliers(company_name)")
        .order("created_at", { ascending: false });
      return (data ?? []) as Purchase[];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*").order("company_name");
      return (data ?? []) as Supplier[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["inventory-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("name");
      return (data ?? []) as Product[];
    },
  });

  const createPurchase = useMutation({
    mutationFn: async () => {
      if (!form.supplier_id) throw new Error("Fournisseur requis");
      if (!form.product_id) throw new Error("Produit requis");
      if (form.quantity <= 0) throw new Error("Quantité invalide");

      const { data: { user } } = await supabase.auth.getUser();
      const total = form.quantity * form.price;

      const { data: purchase, error } = await supabase
        .from("purchases")
        .insert({
          supplier_id: form.supplier_id,
          total,
          status: "received",
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: itemError } = await supabase.from("purchase_items").insert({
        purchase_id: purchase.id,
        product_id: form.product_id,
        quantity: form.quantity,
        price: form.price,
      });
      if (itemError) throw itemError;

      await supabase.from("stock_movements").insert({
        product_id: form.product_id,
        type: "IN",
        quantity: form.quantity,
        reason: `Achat fournisseur #${purchase.id.slice(0, 8)}`,
        user_id: user?.id,
      });
    },
    onSuccess: () => {
      toast.success("Achat enregistré — stock mis à jour");
      setOpen(false);
      setForm({ supplier_id: "", product_id: "", quantity: 1, price: 0 });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div>
      <Header title="Achats" subtitle="Commandes fournisseurs" />
      <div className="p-6 lg:p-8 space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nouvel achat
          </Button>
        </div>

        {isLoading && <Card><CardContent className="p-12 text-center text-off-white/40">Chargement...</CardContent></Card>}
        {isError && <Card><CardContent className="p-12 text-center text-red-400">Erreur de chargement</CardContent></Card>}
        {!isLoading && !isError && purchases.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <p className="text-off-white/40">Aucun achat</p>
              <Button onClick={() => setOpen(true)}>Créer un achat</Button>
            </CardContent>
          </Card>
        )}
        {purchases.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium">
                  {(p as Purchase & { supplier?: { company_name: string } }).supplier?.company_name ?? "—"}
                </p>
                <p className="text-xs text-off-white/40">{formatDateTime(p.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">{formatCurrency(p.total)}</p>
                <Badge variant="secondary" className="capitalize">{p.status}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvel achat</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Fournisseur</Label>
              <select
                className="w-full h-11 rounded-xl bg-charcoal border border-smoked-brown/40 px-3 text-sm"
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
              >
                <option value="">Sélectionner...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.company_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Produit</Label>
              <select
                className="w-full h-11 rounded-xl bg-charcoal border border-smoked-brown/40 px-3 text-sm"
                value={form.product_id}
                onChange={(e) => {
                  const product = products.find((p) => p.id === e.target.value);
                  setForm({
                    ...form,
                    product_id: e.target.value,
                    price: product?.purchase_price ?? 0,
                  });
                }}
              >
                <option value="">Sélectionner...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Prix unitaire</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <p className="text-sm text-off-white/60">
              Total: <span className="text-primary font-bold">{formatCurrency(form.quantity * form.price)}</span>
            </p>
            <Button className="w-full" onClick={() => createPurchase.mutate()} disabled={createPurchase.isPending}>
              Enregistrer l&apos;achat
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
