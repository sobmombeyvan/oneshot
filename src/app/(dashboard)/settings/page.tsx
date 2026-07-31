"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, Trash2 } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";
import {
  adminDeleteTransaction,
  adminResetAllSales,
} from "@/lib/admin-sales";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Invoice } from "@/types/database";

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
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AppSettings>(DEFAULTS);
  const [printer, setPrinter] = useState<CashDrawerSettings>(() => getCashDrawerSettings());
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invoiceToDelete, setInvoiceToDelete] = useState("");
  const [busy, setBusy] = useState<"reset" | "delete" | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["settings-profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, role, fullname")
        .eq("id", user.id)
        .single();
      return data as { id: string; role: string; fullname: string } | null;
    },
  });

  const isAdmin = profile?.role === "administrator";

  const { data: recentInvoices = [] } = useQuery({
    queryKey: ["admin-recent-invoices"],
    enabled: isAdmin && adminUnlocked,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, created_at, payment_method, status")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

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
        status.printers?.find((p) => /pos-?\d|xprint|xp-|thermal/i.test(p)) ??
        status.printers?.find((p) => !/onenote|pdf|fax|xps|sage/i.test(p));
      if (guess) {
        setPrinter((prev) => ({
          ...prev,
          windowsPrinterName: guess,
          paperWidth: /80/.test(guess) ? 80 : prev.paperWidth,
        }));
      }
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

  const unlockAdmin = () => {
    if (adminPassword.trim() !== "11310") {
      toast.error("Mot de passe incorrect");
      return;
    }
    setAdminUnlocked(true);
    toast.success("Zone admin déverrouillée");
  };

  const handleResetSales = async () => {
    if (confirmPassword.trim() !== "11310") {
      toast.error("Confirmez avec le mot de passe 11310");
      return;
    }
    const ok = window.confirm(
      "Effacer TOUTES les ventes, factures, commandes et sessions de caisse ?\nLes produits et comptes utilisateurs sont conservés."
    );
    if (!ok) return;
    setBusy("reset");
    try {
      const result = await adminResetAllSales(supabase, confirmPassword);
      toast.success(
        `Reset OK — ${result.deleted_invoices} factures, ${result.deleted_orders} commandes`
      );
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["admin-recent-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["open-cash-session"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec du reset");
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteTransaction = async (invoiceNumber?: string) => {
    const number = (invoiceNumber ?? invoiceToDelete).trim();
    if (!number) {
      toast.error("Indiquez le numéro de facture");
      return;
    }
    if (confirmPassword.trim() !== "11310") {
      toast.error("Confirmez avec le mot de passe 11310");
      return;
    }
    const ok = window.confirm(
      `Supprimer définitivement la transaction ${number} ?\nLe stock sera rétabli.`
    );
    if (!ok) return;
    setBusy("delete");
    try {
      const result = await adminDeleteTransaction(supabase, confirmPassword, number);
      toast.success(
        `Transaction ${result.invoice_number} supprimée (${formatCurrency(result.total)})`
      );
      setInvoiceToDelete("");
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["admin-recent-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["open-cash-session"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de la suppression");
    } finally {
      setBusy(null);
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
          <CardHeader><CardTitle>XPrinter USB — impression + tiroir</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-off-white/50">
              Le popup navigateur <strong className="text-off-white">ne peut pas</strong> ouvrir le tiroir.
              Sur le PC caisse (sans Node), double-cliquez{" "}
              <code className="text-primary">scripts\start-xprinter-bridge.bat</code>.
              Paiement Cash = impression directe + tiroir auto.
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
              <Label>Largeur papier</Label>
              <div className="flex gap-2">
                {([58, 80] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPrinter({ ...printer, paperWidth: w })}
                    className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                      printer.paperWidth === w
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-smoked-brown/40 text-off-white/60 hover:border-primary/40"
                    }`}
                  >
                    {w} mm
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nom exact imprimante Windows (USB)</Label>
              <Input
                value={printer.windowsPrinterName}
                onChange={(e) => setPrinter({ ...printer, windowsPrinterName: e.target.value })}
                placeholder="Ex: POS-58 / XP-80C"
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

        {isAdmin && (
          <Card className="border-red-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-300">
                <AlertTriangle className="h-5 w-5" />
                Zone administrateur — ventes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-off-white/50">
                Réservé à l&apos;admin. Mot de passe requis : <strong className="text-off-white">11310</strong>.
                Les produits et comptes restent ; seules les ventes / factures / caisses sont touchées.
              </p>

              {!adminUnlocked ? (
                <div className="space-y-3">
                  <Label>Mot de passe admin</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="11310"
                      className="max-w-xs"
                    />
                    <Button type="button" onClick={unlockAdmin}>
                      <Lock className="h-4 w-4" /> Déverrouiller
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Confirmer avec le mot de passe (pour chaque action)</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="11310"
                      className="max-w-xs"
                    />
                  </div>

                  <div className="rounded-xl border border-smoked-brown/40 bg-black/30 p-4 space-y-3">
                    <h3 className="font-semibold text-off-white">Supprimer une transaction</h3>
                    <p className="text-xs text-off-white/50">
                      Entrez le numéro de facture (ex. INV-…) ou choisissez dans la liste.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        value={invoiceToDelete}
                        onChange={(e) => setInvoiceToDelete(e.target.value)}
                        placeholder="N° facture"
                        className="max-w-xs"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy !== null}
                        onClick={() => void handleDeleteTransaction()}
                      >
                        <Trash2 className="h-4 w-4" />
                        {busy === "delete" ? "Suppression…" : "Supprimer"}
                      </Button>
                    </div>
                    {recentInvoices.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-2 pt-2">
                        {recentInvoices.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-smoked-brown/30 px-3 py-2 text-sm"
                          >
                            <div>
                              <p className="font-medium">{inv.invoice_number}</p>
                              <p className="text-xs text-off-white/40">
                                {formatDateTime(inv.created_at)} · {formatCurrency(inv.total)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() => {
                                setInvoiceToDelete(inv.invoice_number);
                                void handleDeleteTransaction(inv.invoice_number);
                              }}
                            >
                              Supprimer
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-4 space-y-3">
                    <h3 className="font-semibold text-red-300">Reset de toutes les ventes</h3>
                    <p className="text-xs text-off-white/50">
                      Efface commandes, factures, paiements, sessions de caisse et notifications.
                      Remet le stock des ventes payées. Ne touche pas aux produits ni aux comptes.
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full"
                      disabled={busy !== null}
                      onClick={() => void handleResetSales()}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {busy === "reset" ? "Reset en cours…" : "Reset toutes les ventes"}
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    className="text-off-white/40"
                    onClick={() => {
                      setAdminUnlocked(false);
                      setAdminPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Verrouiller la zone admin
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Button className="w-full" size="lg" onClick={save}>Sauvegarder</Button>
      </div>
    </div>
  );
}
