"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND, VAT_RATE } from "@/lib/constants";
import {
  getCashDrawerSettings,
  saveCashDrawerSettings,
  openCashDrawer,
  connectUsbCashDrawer,
  type CashDrawerSettings,
} from "@/lib/printer/cash-drawer";

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
  const [printer, setPrinter] = useState<CashDrawerSettings>(() => getCashDrawerSettings());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setForm({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setPrinter(getCashDrawerSettings());
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    saveCashDrawerSettings(printer);
    toast.success("Paramètres sauvegardés");
  };

  const testDrawer = async () => {
    saveCashDrawerSettings(printer);
    const result = await openCashDrawer();
    if (result.ok) {
      toast.success(`Tiroir ouvert (${result.method})`);
    } else {
      toast.error(result.error ?? "Échec ouverture tiroir");
    }
  };

  const pairUsb = async () => {
    const ok = await connectUsbCashDrawer();
    if (ok) {
      toast.success("USB XPrinter autorise. Le tiroir pourra s'ouvrir automatiquement.");
    } else {
      toast.error("Autorisation USB annulee ou indisponible.");
    }
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

        <Card>
          <CardHeader><CardTitle>XPrinter — tiroir caisse</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-off-white/50">
              Paiement <strong className="text-off-white">Cash</strong> = impression XPrinter + ouverture automatique du tiroir.
              Sur le PC caisse, le bridge doit tourner en permanence (
              <code className="text-primary">scripts\install-bridge-autostart.ps1</code>
              ).
            </p>
            <div className="flex items-center gap-3">
              <input
                id="drawer-enabled"
                type="checkbox"
                checked={printer.enabled}
                onChange={(e) => setPrinter({ ...printer, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-smoked-brown/40"
              />
              <Label htmlFor="drawer-enabled">Ouvrir le tiroir sur paiement cash</Label>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="drawer-usb"
                type="checkbox"
                checked={printer.usbDirect}
                onChange={(e) => setPrinter({ ...printer, usbDirect: e.target.checked })}
                className="h-4 w-4 rounded border-smoked-brown/40"
              />
              <Label htmlFor="drawer-usb">Essayer USB direct (POS)</Label>
            </div>
            <div className="space-y-2">
              <Label>URL bridge local</Label>
              <Input
                value={printer.bridgeUrl}
                onChange={(e) => setPrinter({ ...printer, bridgeUrl: e.target.value })}
                placeholder="http://127.0.0.1:17809"
              />
            </div>
            <div className="space-y-2">
              <Label>Nom imprimante QZ Tray (optionnel)</Label>
              <Input
                value={printer.qzPrinterName}
                onChange={(e) => setPrinter({ ...printer, qzPrinterName: e.target.value })}
                placeholder="Xprinter XP-80"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={pairUsb}>
                Autoriser USB XPrinter
              </Button>
              <Button type="button" variant="outline" onClick={testDrawer}>
                Tester le tiroir
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={save}>Sauvegarder</Button>
      </div>
    </div>
  );
}
