"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND, VAT_RATE } from "@/lib/constants";

const STORAGE_KEY = "oneshot-settings";

interface AppSettings {
  name: string;
  subtitle: string;
  address: string;
  phone: string;
  vatRate: number;
  taxId: string;
}

const DEFAULTS: AppSettings = {
  name: BRAND.name,
  subtitle: BRAND.subtitle,
  address: "Douala, Cameroun",
  phone: "",
  vatRate: VAT_RATE,
  taxId: "",
};

export default function SettingsPage() {
  const [form, setForm] = useState<AppSettings>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setForm({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    toast.success("Paramètres sauvegardés");
  };

  return (
    <div>
      <Header title="Paramètres" subtitle="Configuration ONE SHOT Manager" />
      <div className="p-6 lg:p-8 max-w-2xl space-y-6">
        <Card>
          <CardHeader><CardTitle>Informations établissement</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Sous-titre</Label>
              <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Douala, Cameroun" />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+237 6XX XXX XXX" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Fiscalité</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Taux TVA (%)</Label>
              <Input
                type="number"
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Numéro contribuable</Label>
              <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder="M0123456789" />
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={save}>Sauvegarder</Button>
      </div>
    </div>
  );
}
