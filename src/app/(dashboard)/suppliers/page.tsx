"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Supplier } from "@/types/database";

export default function SuppliersPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*").order("company_name");
      return (data ?? []) as Supplier[];
    },
  });

  const createSupplier = useMutation({
    mutationFn: async () => {
      if (!form.company_name.trim()) throw new Error("Nom de société requis");
      const { error } = await supabase.from("suppliers").insert({
        company_name: form.company_name.trim(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fournisseur ajouté");
      setOpen(false);
      setForm({ company_name: "", contact_person: "", phone: "", email: "", address: "" });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div>
      <Header title="Fournisseurs" subtitle="Gestion des fournisseurs" />
      <div className="p-6 lg:p-8">
        <div className="flex justify-end mb-4">
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nouveau fournisseur
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {suppliers.length === 0 ? (
            <Card className="md:col-span-2">
              <CardContent className="p-12 text-center space-y-3">
                <p className="text-off-white/40">Aucun fournisseur</p>
                <Button onClick={() => setOpen(true)}>Ajouter un fournisseur</Button>
              </CardContent>
            </Card>
          ) : (
            suppliers.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-primary/10"><Truck className="h-5 w-5 text-primary" /></div>
                    <div>
                      <p className="font-bold">{s.company_name}</p>
                      <p className="text-sm text-off-white/50 mt-1">{s.contact_person}</p>
                      <p className="text-sm text-off-white/40">{s.phone} • {s.email}</p>
                      {s.address && <p className="text-xs text-off-white/30 mt-2">{s.address}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau fournisseur</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Société</Label>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contact</Label>
              <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <Button className="w-full" onClick={() => createSupplier.mutate()} disabled={createSupplier.isPending}>
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
