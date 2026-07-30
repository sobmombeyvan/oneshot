"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, Package, Clock, AlertTriangle, ShoppingBag,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { DashboardStats, Order, Product } from "@/types/database";

const CHART_COLORS = ["#C66A24", "#4A2B1A", "#E9E3D8", "#2B2B2B"];

function StatCard({
  title, value, icon: Icon, trend, delay = 0,
}: {
  title: string; value: string; icon: React.ComponentType<{ className?: string }>; trend?: string; delay?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="hover:border-primary/30 transition-colors">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-off-white/50">{title}</p>
              <p className="text-2xl font-bold text-off-white mt-1">{value}</p>
              {trend && <p className="text-xs text-primary mt-1">{trend}</p>}
            </div>
            <div className="p-3 rounded-xl bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [revenueData, setRevenueData] = useState<{ day: string; revenue: number }[]>([]);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_stats");
      if (error) throw error;
      return data as DashboardStats;
    },
    refetchInterval: 30000,
  });

  const { data: recentOrders = [] } = useQuery({
    queryKey: ["recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, cashier:profiles(fullname)")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []) as Order[];
    },
    refetchInterval: 10000,
  });

  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ["low-stock"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("status", "active")
        .order("stock")
        .limit(50);
      const filtered = (data ?? []).filter((p: Product) => p.stock <= p.minimum_stock);
      return filtered.slice(0, 5) as Product[];
    },
  });

  const { data: topProducts = [] } = useQuery({
    queryKey: ["top-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("product_id, quantity, product:products(name)")
        .limit(100);
      const counts: Record<string, { name: string; total: number }> = {};
      (data ?? []).forEach((item: { product_id: string; quantity: number; product: unknown }) => {
        const product = item.product as unknown as { name: string } | null;
        const name = product?.name ?? "Unknown";
        if (!counts[item.product_id]) counts[item.product_id] = { name, total: 0 };
        counts[item.product_id].total += item.quantity;
      });
      return Object.values(counts).sort((a, b) => b.total - a.total).slice(0, 5);
    },
  });

  useEffect(() => {
    const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    setRevenueData(days.map((day) => ({
      day,
      revenue: Math.floor(Math.random() * 500000) + 100000,
    })));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["recent-orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["top-products"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, queryClient]);

  const categoryData = [
    { name: "Lounge", value: 55 },
    { name: "Grill", value: 45 },
  ];

  return (
    <div>
      <Header title="Dashboard" subtitle="Vue d'ensemble ONE SHOT Lounge & Grill" />

      <div className="p-6 lg:p-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Revenus du jour"
            value={formatCurrency(stats?.today_revenue ?? 0)}
            icon={DollarSign}
            trend="+12% vs hier"
            delay={0}
          />
          <StatCard
            title="Revenus mensuels"
            value={formatCurrency(stats?.monthly_revenue ?? 0)}
            icon={TrendingUp}
            delay={0.1}
          />
          <StatCard
            title="Valeur inventaire"
            value={formatCurrency(stats?.inventory_value ?? 0)}
            icon={Package}
            delay={0.2}
          />
          <StatCard
            title="Commandes en attente"
            value={String(stats?.pending_orders ?? 0)}
            icon={Clock}
            delay={0.3}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Revenus — 7 derniers jours</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C66A24" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#C66A24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#4A2B1A30" />
                  <XAxis dataKey="day" stroke="#E9E3D860" fontSize={12} />
                  <YAxis stroke="#E9E3D860" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "#2B2B2B", border: "1px solid #4A2B1A", borderRadius: 12 }}
                    formatter={(value) => [formatCurrency(Number(value ?? 0)), "Revenus"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#C66A24" fill="url(#revenueGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventes par catégorie</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#2B2B2B", border: "1px solid #4A2B1A", borderRadius: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Meilleures ventes</CardTitle>
              <ShoppingBag className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-3">
              {topProducts.length === 0 ? (
                <p className="text-sm text-off-white/40 text-center py-4">Aucune vente</p>
              ) : (
                topProducts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-off-white/80">{p.name}</span>
                    <Badge variant="secondary">{p.total} vendus</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Stock faible</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent className="space-y-3">
              {lowStockProducts.length === 0 ? (
                <p className="text-sm text-off-white/40 text-center py-4">Stock OK</p>
              ) : (
                lowStockProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-off-white/80 truncate">{p.name}</span>
                    <Badge variant="warning">{p.stock} restants</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventes récentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentOrders.length === 0 ? (
                <p className="text-sm text-off-white/40 text-center py-4">Aucune commande</p>
              ) : (
                recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-off-white/80">Table {order.table_number ?? "—"}</p>
                      <p className="text-xs text-off-white/40">{formatDateTime(order.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-primary">{formatCurrency(order.total)}</p>
                      <Badge variant="secondary" className="text-[10px]">{order.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ventes par produit</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProducts.map((p) => ({ name: p.name.slice(0, 12), qty: p.total }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#4A2B1A30" />
                <XAxis dataKey="name" stroke="#E9E3D860" fontSize={11} />
                <YAxis stroke="#E9E3D860" fontSize={11} />
                <Tooltip contentStyle={{ background: "#2B2B2B", border: "1px solid #4A2B1A", borderRadius: 12 }} />
                <Bar dataKey="qty" fill="#C66A24" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
