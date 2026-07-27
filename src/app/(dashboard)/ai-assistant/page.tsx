"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles, Send, TrendingDown, Package, BarChart3, Lightbulb } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/database";

interface AIInsight {
  type: "warning" | "info" | "success" | "promo";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

function generateInsights(products: Product[], orders: { total: number; created_at: string }[]): AIInsight[] {
  const insights: AIInsight[] = [];

  const lowStock = products.filter((p) => p.stock <= p.minimum_stock);
  lowStock.forEach((p) => {
    const suggested = Math.max(p.minimum_stock * 3, 20);
    insights.push({
      type: "warning",
      title: `Rupture imminente: ${p.name}`,
      description: `Stock actuel: ${p.stock} unités. Suggestion d'achat: ${suggested} unités pour couvrir 2 semaines.`,
      icon: Package,
    });
  });

  const slowMoving = products.filter((p) => p.stock > p.minimum_stock * 5);
  if (slowMoving.length > 0) {
    insights.push({
      type: "info",
      title: "Produits à rotation lente",
      description: `${slowMoving.length} produit(s) ont un stock élevé: ${slowMoving.slice(0, 3).map((p) => p.name).join(", ")}. Envisagez une promotion.`,
      icon: TrendingDown,
    });
  }

  const todayRevenue = orders
    .filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, o) => sum + o.total, 0);

  insights.push({
    type: "success",
    title: "Résumé du jour",
    description: `Revenus du jour: ${formatCurrency(todayRevenue)}. ${orders.length} commandes traitées. Performance ${todayRevenue > 200000 ? "excellente" : "modérée"}.`,
    icon: BarChart3,
  });

  insights.push({
    type: "promo",
    title: "Promotion suggérée",
    description: "Combo Grill + Cocktail: -15% sur les plats grill les mardis et jeudis soir. Basé sur les tendances de vente du lounge.",
    icon: Lightbulb,
  });

  return insights;
}

export default function AIAssistantPage() {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  const { data: products = [] } = useQuery({
    queryKey: ["ai-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("status", "active");
      return (data ?? []) as Product[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["ai-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("total, created_at").eq("status", "completed");
      return (data ?? []) as { total: number; created_at: string }[];
    },
  });

  const insights = generateInsights(products, orders);

  const handleAsk = () => {
    if (!query.trim()) return;
    setMessages((prev) => [...prev, { role: "user", content: query }]);

    let response = "Je n'ai pas assez de données pour répondre.";
    if (query.toLowerCase().includes("stock")) {
      const low = products.filter((p) => p.stock <= p.minimum_stock);
      response = low.length > 0
        ? `${low.length} produit(s) en stock faible: ${low.map((p) => `${p.name} (${p.stock})`).join(", ")}.`
        : "Tous les stocks sont à niveau acceptable.";
    } else if (query.toLowerCase().includes("vente") || query.toLowerCase().includes("revenu")) {
      const total = orders.reduce((s, o) => s + o.total, 0);
      response = `Revenus totaux enregistrés: ${formatCurrency(total)} sur ${orders.length} commandes.`;
    } else if (query.toLowerCase().includes("promo")) {
      response = "Suggestion: Combo Grill Platter + 2 cocktails à -20% les vendredis. Les ventes lounge sont plus fortes en fin de semaine.";
    }

    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    }, 500);
    setQuery("");
  };

  const insightColors = {
    warning: "border-amber-500/30 bg-amber-500/5",
    info: "border-off-white/20 bg-off-white/5",
    success: "border-emerald-500/30 bg-emerald-500/5",
    promo: "border-primary/30 bg-primary/5",
  };

  return (
    <div>
      <Header title="AI Assistant" subtitle="Intelligence artificielle ONE SHOT" />

      <div className="p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className={insightColors[insight.type]}>
                <CardContent className="p-4 flex gap-3">
                  <insight.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{insight.title}</p>
                    <p className="text-xs text-off-white/60 mt-1">{insight.description}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Poser une question
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-64 overflow-y-auto space-y-3">
              {messages.length === 0 && (
                <p className="text-off-white/40 text-sm text-center py-8">
                  Demandez-moi sur les stocks, ventes, ou promotions...
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                    msg.role === "user" ? "bg-primary/20 text-off-white" : "bg-charcoal text-off-white/80"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                placeholder="Ex: Quels produits sont en rupture de stock?"
                className="flex-1 h-11 rounded-xl border border-smoked-brown/40 bg-charcoal/50 px-4 text-sm text-off-white placeholder:text-off-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Button onClick={handleAsk}><Send className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
