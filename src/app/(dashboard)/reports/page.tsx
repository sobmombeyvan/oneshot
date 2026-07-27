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
import type { Order } from "@/types/database";

interface ActivityLog {
  id: string;
  title: string;
  message: string;
  created_at: string;
  data: { action?: string } | null;
}

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

  const { data: orders = [] } = useQuery({
    queryKey: ["report-orders", period],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["completed", "served", "ready", "preparing", "pending"])
        .gte("created_at", startOfPeriod(period))
        .order("created_at", { ascending: true });
      return (data ?? []) as Order[];
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

  const completed = orders.filter((o) => o.status === "completed" || o.status === "served");
  const totalRevenue = completed.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const totalOrders = completed.length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const chartData = useMemo(() => {
    const buckets = new Map<string, { name: string; ventes: number; commandes: number }>();
    for (const order of completed) {
      const date = new Date(order.created_at);
      let key: string;
      if (period === "daily") key = `${date.getHours()}h`;
      else if (period === "yearly") key = date.toLocaleString("fr", { month: "short" });
      else key = date.toLocaleDateString("fr", { day: "2-digit", month: "short" });
      const prev = buckets.get(key) ?? { name: key, ventes: 0, commandes: 0 };
      prev.ventes += order.total ?? 0;
      prev.commandes += 1;
      buckets.set(key, prev);
    }
    const rows = Array.from(buckets.values());
    return rows.length
      ? rows
      : [{ name: "—", ventes: 0, commandes: 0 }];
  }, [completed, period]);

  const exportCsv = () => {
    const header = "id,date,table,status,total,payment\n";
    const rows = completed
      .map((o) =>
        [
          o.id.slice(0, 8),
          formatDateTime(o.created_at),
          o.table_number ?? "",
          o.status,
          o.total,
          o.payment_method ?? "",
        ].join(",")
      )
      .join("\n");
    downloadBlob(`rapport-${period}.csv`, header + rows, "text/csv;charset=utf-8");
    toast.success("Export CSV téléchargé");
  };

  const exportExcel = () => {
    // Simple TSV that Excel opens cleanly
    const header = "ID\tDate\tTable\tStatut\tTotal\tPaiement\n";
    const rows = completed
      .map((o) =>
        [
          o.id.slice(0, 8),
          formatDateTime(o.created_at),
          o.table_number ?? "",
          o.status,
          o.total,
          o.payment_method ?? "",
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
      <Header title="Rapports" subtitle="Analyses & exports" />
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
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Revenus totaux</p><p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Commandes</p><p className="text-2xl font-bold">{totalOrders}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-off-white/50">Panier moyen</p><p className="text-2xl font-bold">{formatCurrency(avgOrder)}</p></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Ventes</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#4A2B1A30" />
                  <XAxis dataKey="name" stroke="#E9E3D860" fontSize={12} />
                  <YAxis stroke="#E9E3D860" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "#2B2B2B", border: "1px solid #4A2B1A", borderRadius: 12 }} formatter={(value) => formatCurrency(Number(value ?? 0))} />
                  <Bar dataKey="ventes" fill="#C66A24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Volume de commandes</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#4A2B1A30" />
                  <XAxis dataKey="name" stroke="#E9E3D860" fontSize={12} />
                  <YAxis stroke="#E9E3D860" fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#2B2B2B", border: "1px solid #4A2B1A", borderRadius: 12 }} />
                  <Line type="monotone" dataKey="commandes" stroke="#C66A24" strokeWidth={2} dot={{ fill: "#C66A24" }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Journal des modifications</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-center text-off-white/40 py-8 text-sm">
                Aucune activité enregistrée. Les créations, modifications et mouvements de stock apparaîtront ici.
              </p>
            ) : (
              <ul className="divide-y divide-smoked-brown/20">
                {activity.map((log) => {
                  const action = log.data?.action ?? "update";
                  return (
                    <li key={log.id} className="py-3 flex items-start gap-3">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] uppercase font-bold shrink-0 ${ACTION_STYLE[action] ?? "bg-charcoal text-off-white/60"}`}>
                        {action}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{log.title}</p>
                        <p className="text-xs text-off-white/50">{log.message}</p>
                      </div>
                      <span className="text-xs text-off-white/40 shrink-0">{formatDateTime(log.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
