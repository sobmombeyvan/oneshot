"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/types/database";

export default function CustomersPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullname: "", phone: "", email: "" });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("fullname");
      return (data ?? []) as Customer[];
    },
  });

  const createCustomer = useMutation({
    mutationFn: async () => {
      if (!form.fullname.trim()) throw new Error("Nom requis");
      const { error } = await supabase.from("customers").insert({
        fullname: form.fullname.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        loyalty_points: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client ajouté");
      setOpen(false);
      setForm({ fullname: "", phone: "", email: "" });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div>
      <Header title="Clients" subtitle="Base clients & fidélité" />
      <div className="p-6 lg:p-8">
        <div className="flex justify-end mb-4">
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nouveau client
          </Button>
        </div>
        <div className="grid gap-3">
          {customers.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center space-y-3">
                <p className="text-off-white/40">Aucun client</p>
                <Button onClick={() => setOpen(true)}>Ajouter un client</Button>
              </CardContent>
            </Card>
          ) : (
            customers.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10"><Users className="h-4 w-4 text-primary" /></div>
                    <div>
                      <p className="font-medium">{c.fullname}</p>
                      <p className="text-sm text-off-white/50">{c.phone} {c.email && `• ${c.email}`}</p>
                    </div>
                  </div>
                  <Badge variant="default">{c.loyalty_points} pts</Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau client</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nom complet</Label>
              <Input value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+237..." />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <Button className="w-full" onClick={() => createCustomer.mutate()} disabled={createCustomer.isPending}>
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
