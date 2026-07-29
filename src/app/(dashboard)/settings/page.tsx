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
  checkPrinterBridge,
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
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setForm({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setPrinter(getCashDrawerSettings());
    void refreshBridge();
  }, []);

  const refreshBridge = async () => {
    const status = await checkPrinterBridge();
    setBridgeOk(status.ok);
    setPrinters(status.printers ?? []);
    if (status.ok && !printer.windowsPrinterName) {
      const guess =
        status.printers?.find((p) => /xprint|xp-|thermal|pos/i.test(p)) ??
        status.printers?.find((p) => !/onenote|pdf|fax|xps|sage/i.test(p));
      if (guess) setPrinter((prev) => ({ ...prev, windowsPrinterName: guess }));
    }
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    saveCashDrawerSettings(printer);
    toast.success("Paramètres sauvegardés");
  };

  const testDrawer = async () => {
    saveCashDrawerSettings(printer);
    const health = await checkPrinterBridge();
    if (!health.ok) {
      toast.error("Bridge offline. Lancez scripts\\start-xprinter-bridge.bat sur ce PC.");
      return;
    }
    const result = await openCashDrawer();
    if (result.ok) toast.success(`Tiroir ouvert (${result.method})`);
    else toast.error(result.error ?? "Échec ouverture tiroir");
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
          <CardHeader><CardTitle>XPrinter USB — impression + tiroir</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-off-white/50">
              Le popup navigateur <strong className="text-off-white">ne peut pas</strong> ouvrir le tiroir.
              Il faut le bridge local. Paiement Cash = impression directe + tiroir auto.
            </p>

            <div className={`rounded-xl border px-3 py-2 text-sm ${bridgeOk ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400"}`}>
              Bridge: {bridgeOk === null ? "…" : bridgeOk ? "EN LIGNE" : "OFFLINE — lancez start-xprinter-bridge.bat"}
            </div>

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

            <div className="space-y-2">
              <Label>URL bridge local</Label>
              <Input
                value={printer.bridgeUrl}
                onChange={(e) => setPrinter({ ...printer, bridgeUrl: e.target.value })}
                placeholder="http://127.0.0.1:17809"
              />
            </div>

            <div className="space-y-2">
              <Label>Nom exact imprimante Windows (USB)</Label>
              <Input
                value={printer.windowsPrinterName}
                onChange={(e) => setPrinter({ ...printer, windowsPrinterName: e.target.value })}
                placeholder="Ex: XP-80C / Xprinter XP-80"
              />
              {printers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {printers.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setPrinter({ ...printer, windowsPrinterName: name })}
                      className="rounded-lg border border-smoked-brown/40 px-2 py-1 text-[11px] text-off-white/70 hover:border-primary/50"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void refreshBridge()}>
                Verifier bridge
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
