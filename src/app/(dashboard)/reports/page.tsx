"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { CashSession, Invoice, InvoicePayment } from "@/types/database";

interface ActivityLog {
  id: string;
  title: string;
  message: string;
  created_at: string;
  data: { action?: string } | null;
}

type InvoiceRow = Invoice & {
  payments?: InvoicePayment[];
};

const PERIODS = ["daily", "weekly", "monthly", "yearly"] as const;

const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-500/20 text-emerald-400",
  update: "bg-amber-500/20 text-amber-400",
  delete: "bg-red-500/20 text-red-400",
  stock: "bg-primary/20 text-primary",
  purchase: "bg-blue-500/20 text-blue-400",
  order: "bg-purple-500/20 text-purple-400",
};

function startOfPeriod(period: (typeof PERIODS)[number]) {
  const now = new Date();
  const d = new Date(now);
  if (period === "daily") d.setHours(0, 0, 0, 0);
  else if (period === "weekly") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
  } else if (period === "monthly") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("monthly");
  const supabase = createClient();

  const { data: invoices = [] } = useQuery({
    queryKey: ["report-invoices", period],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*, payments:invoice_payments(*)")
        .eq("status", "paid")
        .gte("created_at", startOfPeriod(period))
        .order("created_at", { ascending: true });
      return (data ?? []) as InvoiceRow[];
    },
  });

  const { data: cashSessions = [] } = useQuery({
    queryKey: ["report-cash-sessions", period],
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_sessions")
        .select("*, cashier:profiles(fullname)")
        .gte("opened_at", startOfPeriod(period))
        .order("opened_at", { ascending: false });
      return (data ?? []) as CashSession[];
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("type", "activity")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as ActivityLog[];
    },
  });

  const totalRevenue = invoices.reduce((sum, i) => sum + (i.total ?? 0), 0);
  const totalOrders = invoices.length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const byMethod = useMemo(() => {
    const totals: Record<string, number> = {
      cash: 0,
      orange_money: 0,
      mtn_momo: 0,
      bank_card: 0,
    };
    let cashReceived = 0;
    let changeDue = 0;

    for (const inv of invoices) {
      cashReceived += Number(inv.amount_received ?? 0);
      changeDue += Number(inv.change_due ?? 0);
      const payments = inv.payments ?? [];
      if (payments.length) {
        for (const p of payments) {
          if (p.method in totals) totals[p.method] += Number(p.amount);
        }
      } else if (inv.payment_method && inv.payment_method in totals) {
        totals[inv.payment_method] += Number(inv.total);
      } else if (inv.payment_method === "mixed") {
        totals.cash += Number(inv.total);
      }
    }

    return { totals, cashReceived, changeDue, netCash: cashReceived - changeDue };
  }, [invoices]);

  const chartData = useMemo(() => {
    const buckets = new Map<string, { name: string; ventes: number; commandes: number }>();
    for (const invoice of invoices) {
      const date = new Date(invoice.created_at);
      let key: string;
      if (period === "daily") key = `${date.getHours()}h`;
      else if (period === "yearly") key = date.toLocaleString("fr", { month: "short" });
      else key = date.toLocaleDateString("fr", { day: "2-digit", month: "short" });
      const prev = buckets.get(key) ?? { name: key, ventes: 0, commandes: 0 };
      prev.ventes += invoice.total ?? 0;
      prev.commandes += 1;
      buckets.set(key, prev);
    }
    const rows = Array.from(buckets.values());
    return rows.length ? rows : [{ name: "—", ventes: 0, commandes: 0 }];
  }, [invoices, period]);

  const closedVariance = cashSessions
    .filter((s) => s.status === "closed" && s.variance != null)
    .reduce((sum, s) => sum + Number(s.variance ?? 0), 0);

  const exportCsv = () => {
    const header = "invoice,date,total,method,received,change\n";
    const rows = invoices
      .map((i) =>
        [
          i.invoice_number,
          formatDateTime(i.created_at),
          i.total,
          i.payment_method ?? "",
          i.amount_received ?? "",
          i.change_due ?? "",
        ].join(",")
      )
      .join("\n");
    downloadBlob(`rapport-${period}.csv`, header + rows, "text/csv;charset=utf-8");
    toast.success("Export CSV téléchargé");
  };

  const exportExcel = () => {
    const header = "Facture\tDate\tTotal\tPaiement\tReçu\tMonnaie\n";
    const rows = invoices
      .map((i) =>
        [
          i.invoice_number,
          formatDateTime(i.created_at),
          i.total,
          i.payment_method ?? "",
          i.amount_received ?? "",
          i.change_due ?? "",
        ].join("\t")
      )
      .join("\n");
    downloadBlob(`rapport-${period}.xls`, header + rows, "application/vnd.ms-excel");
    toast.success("Export Excel téléchargé");
  };

  const exportPdf = () => {
    window.print();
    toast.message("Utilisez Imprimer → Enregistrer en PDF");
  };

  return (
    <div>
      <Header title="Rapports" subtitle="Analyses & exports (factures payées)" />
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex flex-wrap gap-2 no-print">
          {PERIODS.map((p) => (
            <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)} className="capitalize">
              {p === "daily" ? "Journalier" : p === "weekly" ? "Hebdomadaire" : p === "monthly" ? "Mensuel" : "Annuel"}
            </Button>
          ))}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="h-4 w-4" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Revenus (payés)</p><p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Factures</p><p className="text-2xl font-bold">{totalOrders}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Panier moyen</p><p className="text-2xl font-bold">{formatCurrency(avgOrder)}</p></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Espèces</p><p className="text-xl font-bold">{formatCurrency(byMethod.totals.cash)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Orange Money</p><p className="text-xl font-bold">{formatCurrency(byMethod.totals.orange_money)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">MTN MoMo</p><p className="text-xl font-bold">{formatCurrency(byMethod.totals.mtn_momo)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Carte</p><p className="text-xl font-bold">{formatCurrency(byMethod.totals.bank_card)}</p></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Espèces reçues</p><p className="text-xl font-bold text-emerald-300">{formatCurrency(byMethod.cashReceived)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Monnaie rendue</p><p className="text-xl font-bold text-amber-300">{formatCurrency(byMethod.changeDue)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Écarts de caisse</p><p className="text-xl font-bold">{formatCurrency(closedVariance)}</p></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Ventes</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaSafeBar data={chartData} />
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Commandes</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#4A2B1A30" />
                  <XAxis dataKey="name" stroke="#E9E3D860" fontSize={12} />
                  <YAxis stroke="#E9E3D860" fontSize={12} />
                  <Tooltip contentStyle={{ background: "#2B2B2B", border: "1px solid #4A2B1A", borderRadius: 12 }} />
                  <Line type="monotone" dataKey="commandes" stroke="#C66A24" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Clôtures de caisse</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {cashSessions.length === 0 ? (
              <p className="text-sm text-off-white/40">Aucune session sur la période</p>
            ) : (
              cashSessions.slice(0, 15).map((s) => (
                <div key={s.id} className="flex justify-between text-sm border-b border-smoked-brown/20 pb-2">
                  <div>
                    <p className="font-medium">{s.cashier?.fullname ?? "Caissier"}</p>
                    <p className="text-xs text-off-white/40">{formatDateTime(s.opened_at)}</p>
                  </div>
                  <div className="text-right">
                    <p>{s.status === "open" ? "Ouverte" : "Clôturée"}</p>
                    <p className="text-xs text-off-white/50">
                      Attendu {formatCurrency(s.expected_cash)}
                      {s.variance != null ? ` · écart ${formatCurrency(s.variance)}` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="no-print">
          <CardHeader><CardTitle>Journal des modifications</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {activity.length === 0 ? (
              <p className="text-sm text-off-white/40">Aucune activité</p>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 text-sm">
                  <span className={`px-2 py-0.5 rounded text-[10px] ${ACTION_STYLE[a.data?.action ?? ""] ?? "bg-charcoal text-off-white/60"}`}>
                    {a.data?.action ?? "log"}
                  </span>
                  <div>
                    <p>{a.title}</p>
                    <p className="text-xs text-off-white/40">{a.message} · {formatDateTime(a.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AreaSafeBar({ data }: { data: { name: string; ventes: number; commandes: number }[] }) {
  return (
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#4A2B1A30" />
      <XAxis dataKey="name" stroke="#E9E3D860" fontSize={12} />
      <YAxis stroke="#E9E3D860" fontSize={12} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} />
      <Tooltip
        contentStyle={{ background: "#2B2B2B", border: "1px solid #4A2B1A", borderRadius: 12 }}
        formatter={(value) => [formatCurrency(Number(value ?? 0)), "Ventes"]}
      />
      <Bar dataKey="ventes" fill="#C66A24" radius={[6, 6, 0, 0]} />
    </BarChart>
  );
}
