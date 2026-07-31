"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Printer, History,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { createClient } from "@/lib/supabase/client";
import {
  addCashMovement,
  CASH_MOVEMENT_LABELS,
  closeCashSession,
  getOpenCashSession,
  listSessionMovements,
  openCashSession,
} from "@/lib/cash";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import type { CashSession } from "@/types/database";

export default function CashPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [openingFloat, setOpeningFloat] = useState("0");
  const [moveType, setMoveType] = useState<"cash_in" | "cash_out">("cash_in");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeReceipt, setCloseReceipt] = useState<ReceiptData | null>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ["open-cash-session"],
    queryFn: () => getOpenCashSession(supabase),
    refetchInterval: 10000,
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["cash-movements", session?.id],
    enabled: !!session?.id,
    queryFn: () => listSessionMovements(supabase, session!.id),
    refetchInterval: 10000,
  });

  const { data: recentSessions = [] } = useQuery({
    queryKey: ["cash-sessions-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*, cashier:profiles(fullname)")
        .order("opened_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as CashSession[];
    },
  });

  const { data: methodTotals } = useQuery({
    queryKey: ["cash-session-methods", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, total, payment_method, amount_received, change_due, payments:invoice_payments(method, amount)")
        .eq("cash_session_id", session!.id)
        .eq("status", "paid");
      if (error) throw error;

      const totals: Record<string, number> = {
        cash: 0,
        orange_money: 0,
        mtn_momo: 0,
        bank_card: 0,
      };
      let cashReceived = 0;
      let changeOut = 0;

      for (const inv of data ?? []) {
        cashReceived += Number(inv.amount_received ?? 0);
        changeOut += Number(inv.change_due ?? 0);
        const payments = (inv.payments ?? []) as { method: string; amount: number }[];
        if (payments.length) {
          for (const p of payments) {
            if (p.method in totals) totals[p.method] += Number(p.amount);
          }
        } else if (inv.payment_method && inv.payment_method in totals) {
          totals[inv.payment_method] += Number(inv.total);
        }
      }

      return { totals, cashReceived, changeOut, invoiceCount: (data ?? []).length };
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["open-cash-session"] });
    queryClient.invalidateQueries({ queryKey: ["cash-movements"] });
    queryClient.invalidateQueries({ queryKey: ["cash-sessions-recent"] });
    queryClient.invalidateQueries({ queryKey: ["cash-session-methods"] });
  };

  const openMutation = useMutation({
    mutationFn: async () => {
      const float = parseFloat(openingFloat) || 0;
      if (float < 0) throw new Error("Fond invalide");
      return openCashSession(supabase, float);
    },
    onSuccess: () => {
      toast.success("Caisse ouverte");
      setOpeningFloat("0");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Aucune caisse ouverte");
      const amount = parseFloat(moveAmount) || 0;
      if (amount <= 0) throw new Error("Montant invalide");
      if (!moveReason.trim()) throw new Error("Motif obligatoire");
      return addCashMovement(supabase, session.id, moveType, amount, moveReason.trim());
    },
    onSuccess: () => {
      toast.success(moveType === "cash_in" ? "Entrée enregistrée" : "Sortie enregistrée");
      setMoveAmount("");
      setMoveReason("");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Aucune caisse ouverte");
      const counted = parseFloat(countedCash);
      if (Number.isNaN(counted) || counted < 0) throw new Error("Montant compté invalide");
      return closeCashSession(supabase, session.id, counted, closeNotes.trim() || undefined);
    },
    onSuccess: (result) => {
      const receiptData: ReceiptData = {
        title: "Clôture de caisse",
        createdAt: new Date().toISOString(),
        items: [
          { name: "Fond d'ouverture", quantity: 1, price: session?.opening_float ?? 0 },
          { name: "Solde théorique", quantity: 1, price: result.expected_cash },
          { name: "Espèces comptées", quantity: 1, price: result.counted_cash },
          { name: "Écart", quantity: 1, price: result.variance },
        ],
        subtotal: result.expected_cash,
        tax: 0,
        total: result.counted_cash,
        notes:
          result.variance === 0
            ? "Caisse juste"
            : result.variance > 0
              ? `Excédent ${formatCurrency(result.variance)}`
              : `Manquant ${formatCurrency(Math.abs(result.variance))}`,
      };
      setCloseReceipt(receiptData);
      setShowClose(false);
      setCountedCash("");
      setCloseNotes("");
      refresh();
      toast.success(
        result.variance === 0
          ? "Caisse clôturée — juste"
          : `Caisse clôturée — écart ${formatCurrency(result.variance)}`
      );
      void printReceipt(receiptData);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const expectedPreview = useMemo(() => {
    if (!session) return 0;
    const counted = parseFloat(countedCash);
    if (Number.isNaN(counted)) return null;
    return counted - session.expected_cash;
  }, [session, countedCash]);

  return (
    <div>
      <Header title="Caisse" subtitle="Ouverture · suivi · clôture par caissier" />
      {closeReceipt && <ReceiptPrintView data={closeReceipt} />}

      <div className="p-6 lg:p-8 space-y-6 no-print">
        {isLoading ? (
          <p className="text-off-white/40">Chargement…</p>
        ) : !session ? (
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Unlock className="h-5 w-5 text-primary" /> Ouvrir la caisse
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-off-white/50">
                Chaque caissier a sa propre caisse. Saisissez le fond d&apos;ouverture avant d&apos;encaisser.
              </p>
              <div className="space-y-2">
                <Label htmlFor="float">Fond d&apos;ouverture (FCFA)</Label>
                <Input
                  id="float"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  className="h-12 text-lg"
                />
              </div>
              <Button
                className="w-full h-12"
                onClick={() => openMutation.mutate()}
                disabled={openMutation.isPending}
              >
                <Banknote className="h-4 w-4" />
                {openMutation.isPending ? "Ouverture…" : "Ouvrir ma caisse"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-off-white/50">Statut</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="success">Ouverte</Badge>
                    <span className="text-xs text-off-white/40">
                      depuis {formatDateTime(session.opened_at)}
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-off-white/50">Fond d&apos;ouverture</p>
                  <p className="text-2xl font-bold">{formatCurrency(session.opening_float)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-off-white/50">Solde théorique</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(session.expected_cash)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-off-white/50">Factures session</p>
                  <p className="text-2xl font-bold">{methodTotals?.invoiceCount ?? 0}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ventes par mode (session)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    ["Espèces (net)", (methodTotals?.totals.cash ?? 0)],
                    ["Orange Money", methodTotals?.totals.orange_money ?? 0],
                    ["MTN MoMo", methodTotals?.totals.mtn_momo ?? 0],
                    ["Carte", methodTotals?.totals.bank_card ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between text-sm">
                      <span className="text-off-white/60">{label}</span>
                      <span className="font-medium">{formatCurrency(Number(value))}</span>
                    </div>
                  ))}
                  <div className="border-t border-smoked-brown/30 pt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-off-white/50">Espèces reçues</span>
                      <span>{formatCurrency(methodTotals?.cashReceived ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-off-white/50">Monnaie rendue</span>
                      <span className="text-amber-300">
                        -{formatCurrency(methodTotals?.changeOut ?? 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Entrée / sortie manuelle</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMoveType("cash_in")}
                      className={cn(
                        "rounded-xl border p-3 text-sm flex items-center justify-center gap-2",
                        moveType === "cash_in"
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-smoked-brown/40"
                      )}
                    >
                      <ArrowDownCircle className="h-4 w-4" /> Entrée
                    </button>
                    <button
                      type="button"
                      onClick={() => setMoveType("cash_out")}
                      className={cn(
                        "rounded-xl border p-3 text-sm flex items-center justify-center gap-2",
                        moveType === "cash_out"
                          ? "border-red-500/50 bg-red-500/10 text-red-300"
                          : "border-smoked-brown/40"
                      )}
                    >
                      <ArrowUpCircle className="h-4 w-4" /> Sortie
                    </button>
                  </div>
                  <div className="space-y-1">
                    <Label>Montant</Label>
                    <Input
                      type="number"
                      min={0}
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Motif (obligatoire)</Label>
                    <Input
                      value={moveReason}
                      onChange={(e) => setMoveReason(e.target.value)}
                      placeholder="Ex: monnaies, achat urgent…"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => moveMutation.mutate()}
                    disabled={moveMutation.isPending}
                  >
                    Enregistrer
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => {
                      setCountedCash(String(session.expected_cash));
                      setShowClose(true);
                    }}
                  >
                    <Lock className="h-4 w-4" /> Clôturer la caisse
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Mouvements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {movements.length === 0 ? (
                  <p className="text-sm text-off-white/40 py-4 text-center">Aucun mouvement</p>
                ) : (
                  movements.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 text-sm border-b border-smoked-brown/20 pb-2"
                    >
                      <div>
                        <p className="font-medium">{CASH_MOVEMENT_LABELS[m.type] ?? m.type}</p>
                        <p className="text-xs text-off-white/40">
                          {formatDateTime(m.created_at)}
                          {m.reason ? ` · ${m.reason}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "font-semibold",
                          m.type === "change_out" || m.type === "cash_out"
                            ? "text-red-300"
                            : "text-emerald-300"
                        )}
                      >
                        {m.type === "change_out" || m.type === "cash_out" ? "-" : "+"}
                        {formatCurrency(m.amount)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions récentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSessions.length === 0 ? (
              <p className="text-sm text-off-white/40">Aucune session</p>
            ) : (
              recentSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-smoked-brown/20 pb-2"
                >
                  <div>
                    <p className="font-medium">{s.cashier?.fullname ?? "Caissier"}</p>
                    <p className="text-xs text-off-white/40">
                      {formatDateTime(s.opened_at)}
                      {s.closed_at ? ` → ${formatDateTime(s.closed_at)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={s.status === "open" ? "success" : "secondary"}>
                      {s.status === "open" ? "Ouverte" : "Clôturée"}
                    </Badge>
                    <p className="text-xs text-off-white/50 mt-1">
                      Attendu {formatCurrency(s.expected_cash)}
                      {s.variance != null && (
                        <> · écart {formatCurrency(s.variance)}</>
                      )}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent className="no-print max-w-md">
          <DialogHeader>
            <DialogTitle>Clôturer la caisse</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-off-white/50">
            Solde théorique :{" "}
            <strong className="text-primary">
              {formatCurrency(session?.expected_cash ?? 0)}
            </strong>
          </p>
          <div className="space-y-2">
            <Label>Espèces réellement comptées</Label>
            <Input
              type="number"
              min={0}
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              className="h-12 text-lg"
            />
          </div>
          {expectedPreview != null && (
            <p
              className={cn(
                "text-sm font-medium",
                expectedPreview === 0
                  ? "text-emerald-400"
                  : expectedPreview > 0
                    ? "text-amber-300"
                    : "text-red-400"
              )}
            >
              Écart : {formatCurrency(expectedPreview)}
            </p>
          )}
          <div className="space-y-2">
            <Label>Notes (optionnel)</Label>
            <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setShowClose(false)}>Retour</Button>
            <Button
              variant="destructive"
              disabled={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              <Printer className="h-4 w-4" />
              {closeMutation.isPending ? "Clôture…" : "Clôturer & imprimer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
