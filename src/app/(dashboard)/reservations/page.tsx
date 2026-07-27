"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Reservation } from "@/types/database";

export default function ReservationsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ customer_name: "", phone: "", date: "", time: "", guests: 2, notes: "" });

  const { data: reservations = [] } = useQuery({
    queryKey: ["reservations"],
    queryFn: async () => {
      const { data } = await supabase.from("reservations").select("*").order("date", { ascending: true });
      return (data ?? []) as Reservation[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("reservations").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Réservation créée");
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div>
      <Header title="Réservations" subtitle="Gestion des réservations" />
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex justify-end">
          <Button onClick={() => setShowDialog(true)}><Plus className="h-4 w-4" /> Nouvelle réservation</Button>
        </div>

        <div className="grid gap-4">
          {reservations.length === 0 ? (
            <Card><CardContent className="p-12 text-center text-off-white/40">Aucune réservation</CardContent></Card>
          ) : (
            reservations.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-primary/10"><Calendar className="h-5 w-5 text-primary" /></div>
                    <div>
                      <p className="font-medium">{r.customer_name}</p>
                      <p className="text-sm text-off-white/50">{r.phone} • {r.guests} personnes</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatDate(r.date)} — {r.time}</p>
                    <Badge variant="secondary" className="mt-1 capitalize">{r.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle réservation</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nom</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Heure</Label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Invités</Label><Input type="number" value={form.guests} onChange={(e) => setForm({ ...form, guests: parseInt(e.target.value) || 2 })} /></div>
            <Button className="w-full" onClick={() => createMutation.mutate()}>Confirmer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
