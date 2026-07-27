"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { logActivity } from "@/lib/activity";
import { TABLE_STATUSES } from "@/lib/constants";
import type { RestaurantTable, TableStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<TableStatus, string> = {
  available: "Disponible",
  occupied: "Occupée",
  reserved: "Réservée",
  cleaning: "Nettoyage",
};

export default function TablesPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [form, setForm] = useState({ number: 1, status: "available" as TableStatus });

  const { data: tables = [] } = useQuery({
    queryKey: ["restaurant-tables"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurant_tables").select("*").order("number");
      return (data ?? []) as RestaurantTable[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["restaurant-tables"] });
    queryClient.invalidateQueries({ queryKey: ["activity-log"] });
  };

  const openCreate = () => {
    const nextNumber = tables.length
      ? Math.max(...tables.map((t) => t.number)) + 1
      : 1;
    setEditing(null);
    setForm({ number: nextNumber, status: "available" });
    setDialogOpen(true);
  };

  const openEdit = (table: RestaurantTable) => {
    setEditing(table);
    setForm({ number: table.number, status: table.status });
    setDialogOpen(true);
  };

  const saveTable = useMutation({
    mutationFn: async () => {
      if (!form.number || form.number < 1) throw new Error("Numéro de table invalide");

      const conflict = tables.find(
        (t) => t.number === form.number && t.id !== editing?.id
      );
      if (conflict) throw new Error(`La table ${form.number} existe déjà`);

      if (editing) {
        const { error } = await supabase
          .from("restaurant_tables")
          .update({ number: form.number, status: form.status })
          .eq("id", editing.id);
        if (error) throw error;

        await logActivity(supabase, {
          action: "update",
          entity: "table",
          title: `Table ${form.number} modifiée`,
          message: `N° ${editing.number} → ${form.number} · ${STATUS_LABELS[editing.status]} → ${STATUS_LABELS[form.status]}`,
          data: { table_id: editing.id },
        });
      } else {
        const { error } = await supabase.from("restaurant_tables").insert({
          number: form.number,
          status: form.status,
        });
        if (error) throw error;

        await logActivity(supabase, {
          action: "create",
          entity: "table",
          title: `Table ${form.number} créée`,
          message: `Statut: ${STATUS_LABELS[form.status]}`,
          data: { number: form.number },
        });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Table modifiée" : "Table créée");
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTable = useMutation({
    mutationFn: async (table: RestaurantTable) => {
      const { error } = await supabase
        .from("restaurant_tables")
        .delete()
        .eq("id", table.id);
      if (error) throw error;

      await logActivity(supabase, {
        action: "delete",
        entity: "table",
        title: `Table ${table.number} supprimée`,
        message: `Statut était: ${STATUS_LABELS[table.status]}`,
        data: { table_id: table.id, number: table.number },
      });
    },
    onSuccess: () => {
      toast.success("Table supprimée");
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const getStatusStyle = (status: string) => {
    const s = TABLE_STATUSES.find((t) => t.value === status);
    return s?.color ?? "";
  };

  return (
    <div>
      <Header title="Tables" subtitle="Créer, modifier et gérer les tables du restaurant" />
      <div className="p-6 lg:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3 text-xs text-off-white/50">
            {TABLE_STATUSES.map((s) => (
              <span key={s.value} className={cn("px-2 py-1 rounded-lg capitalize", s.color)}>
                {STATUS_LABELS[s.value as TableStatus] ?? s.label}
              </span>
            ))}
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nouvelle table
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {tables.map((table) => (
            <Card key={table.id} className={cn("transition-all", getStatusStyle(table.status))}>
              <CardContent className="p-4 text-center space-y-3">
                <button
                  type="button"
                  className="w-full cursor-pointer"
                  onClick={() => openEdit(table)}
                  title="Modifier la table"
                >
                  <p className="font-[family-name:var(--font-cinzel)] text-3xl font-bold">{table.number}</p>
                  <p className="text-xs mt-2 opacity-70">
                    {STATUS_LABELS[table.status] ?? table.status}
                  </p>
                </button>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/pos?table=${table.number}`)}
                    title="Commander"
                  >
                    <ShoppingCart className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(table)}
                    title="Modifier"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {tables.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <p className="text-off-white/40">Aucune table configurée</p>
              <Button onClick={openCreate}>Ajouter une table</Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier table ${editing.number}` : "Nouvelle table"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Numéro de table</Label>
              <Input
                type="number"
                min={1}
                value={form.number}
                onChange={(e) => setForm({ ...form, number: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(STATUS_LABELS) as TableStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setForm({ ...form, status })}
                    className={cn(
                      "px-3 py-2 rounded-xl text-sm border transition-colors",
                      form.status === status
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-smoked-brown/40 text-off-white/60 hover:border-primary/40"
                    )}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => saveTable.mutate()}
              disabled={saveTable.isPending}
            >
              {saveTable.isPending
                ? "Enregistrement..."
                : editing
                  ? "Enregistrer les modifications"
                  : "Créer la table"}
            </Button>
            {editing && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  if (confirm(`Supprimer la table ${editing.number} ?`)) {
                    deleteTable.mutate(editing);
                  }
                }}
                disabled={deleteTable.isPending}
              >
                <Trash2 className="h-4 w-4" /> Supprimer la table
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
