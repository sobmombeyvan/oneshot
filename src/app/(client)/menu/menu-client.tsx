"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  LogOut,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  CheckCircle2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { clearTabletSession, getTabletSession, setTabletSession } from "@/lib/tablet";
import { BRAND, VAT_RATE } from "@/lib/constants";
import { TABLE_COUNT, sortCategories } from "@/lib/menu";
import { calculateTotal, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProductMenuBrowser } from "@/components/menu/product-menu-browser";
import type { CartItem, Category, Product, RestaurantTable } from "@/types/database";

export default function ClientMenuPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderSent, setOrderSent] = useState(false);

  useEffect(() => {
    const fromQuery = Number(searchParams.get("table"));
    const session = getTabletSession();
    const table =
      Number.isFinite(fromQuery) && fromQuery > 0
        ? fromQuery
        : (session?.tableNumber ?? null);
    if (table) {
      setTableNumber(table);
      setTabletSession(table);
    }
  }, [searchParams]);

  const { data: categories = [] } = useQuery({
    queryKey: ["client-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .in("type", ["lounge", "grill"])
        .order("name");
      if (error) throw error;
      return sortCategories((data ?? []) as Category[]);
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["client-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, category:categories(*)")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const { data: tables = [] } = useQuery({
    queryKey: ["client-tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .order("number");
      if (error) throw error;
      return (data ?? []) as RestaurantTable[];
    },
  });

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.selling_price * item.quantity, 0),
    [cart]
  );
  const totals = calculateTotal(subtotal, 0, VAT_RATE);
  const cartCount = cart.reduce((n, item) => n + item.quantity, 0);

  const addToCart = (product: Product) => {
    setOrderSent(false);
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const sendOrder = useMutation({
    mutationFn: async () => {
      if (!tableNumber) throw new Error("Choisissez une table");
      if (cart.length === 0) throw new Error("Panier vide");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const table = tables.find((t) => t.number === tableNumber) ?? null;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          table_number: tableNumber,
          table_id: table?.id ?? null,
          cashier_id: user.id,
          status: "pending",
          payment_method: null,
          subtotal: totals.subtotal,
          discount: 0,
          tax: totals.tax,
          total: totals.total,
          notes: `Commande tablette client — table ${tableNumber}`,
        })
        .select("id")
        .single();

      if (orderError || !order) {
        throw new Error(orderError?.message ?? "Impossible de créer la commande");
      }

      const items = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.product.selling_price,
        station: item.product.category?.type === "lounge" ? "bar" : "kitchen",
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(items);
      if (itemsError) throw new Error(itemsError.message);

      if (table?.id) {
        await supabase
          .from("restaurant_tables")
          .update({ status: "occupied" })
          .eq("id", table.id);
      }

      return order.id as string;
    },
    onSuccess: () => {
      setCart([]);
      setCartOpen(false);
      setOrderSent(true);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Commande envoyée à la cuisine / caisse");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleLogout = async () => {
    clearTabletSession();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (!tableNumber) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
        <UtensilsCrossed className="h-12 w-12 text-primary" />
        <div className="text-center space-y-2">
          <h1 className="font-[family-name:var(--font-cinzel)] text-3xl text-primary">
            {BRAND.name}
          </h1>
          <p className="text-off-white/60">Choisissez votre table pour commencer</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 w-full max-w-lg">
          {(tables.length > 0
            ? tables
            : Array.from({ length: TABLE_COUNT }, (_, i) => ({
                id: String(i + 1),
                number: i + 1,
                status: "available" as const,
                created_at: "",
              }))
          ).map((table) => (
            <button
              key={table.id}
              type="button"
              onClick={() => {
                setTabletSession(table.number);
                setTableNumber(table.number);
                router.replace(`/menu?table=${table.number}`);
              }}
              className="h-16 rounded-2xl border border-smoked-brown/40 bg-charcoal/60 text-lg font-semibold hover:border-primary hover:bg-primary/10"
            >
              {table.number}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={handleLogout} className="text-off-white/50">
          <LogOut className="h-4 w-4" /> Quitter
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-smoked-brown/30 bg-black/95 backdrop-blur-md px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-cinzel)] text-xl sm:text-2xl font-bold text-primary tracking-wide">
              {BRAND.name}
            </h1>
            <p className="text-xs sm:text-sm text-off-white/50">
              Table {tableNumber} · choisissez vos plats
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative h-12 px-4 rounded-xl bg-primary text-black font-semibold flex items-center gap-2"
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="hidden sm:inline">Panier</span>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-6 h-6 rounded-full bg-off-white text-black text-xs font-bold flex items-center justify-center px-1">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="h-12 w-12 rounded-xl border border-smoked-brown/40 flex items-center justify-center text-off-white/60"
              aria-label="Déconnexion"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-3 sm:p-5 pb-28 min-h-0">
        {orderSent && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-300 shrink-0">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              Commande envoyée. Vous pouvez en ajouter une autre quand vous voulez.
            </p>
          </div>
        )}

        <ProductMenuBrowser
          products={products}
          categories={categories}
          onAdd={addToCart}
          variant="catalog"
          isLoading={isLoading}
          searchPlaceholder="Rechercher un plat ou une boisson…"
          className="flex-1 min-h-0"
        />
      </main>

      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:w-80 z-40">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full h-14 rounded-2xl bg-primary text-black font-semibold shadow-lg shadow-black/40 flex items-center justify-between px-5"
          >
            <span>
              {cartCount} article{cartCount > 1 ? "s" : ""}
            </span>
            <span>{formatCurrency(totals.total)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            className="flex-1 bg-black/70"
            aria-label="Fermer"
            onClick={() => setCartOpen(false)}
          />
          <aside className="w-full max-w-md bg-charcoal border-l border-smoked-brown/40 h-full flex flex-col">
            <div className="px-5 py-4 border-b border-smoked-brown/30 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Votre commande</h2>
                <p className="text-sm text-off-white/50">Table {tableNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="text-off-white/50 text-sm"
              >
                Fermer
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-center text-off-white/40 py-12">Panier vide</p>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="rounded-xl border border-smoked-brown/30 bg-black/30 p-3"
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.product.name}</p>
                        <p className="text-sm text-primary">
                          {formatCurrency(item.product.selling_price)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        className="text-off-white/40 hover:text-red-400 p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="h-11 w-11 rounded-xl border border-smoked-brown/40 flex items-center justify-center"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="text-lg font-semibold w-8 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="h-11 w-11 rounded-xl border border-smoked-brown/40 flex items-center justify-center"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <span className="ml-auto font-semibold">
                        {formatCurrency(item.product.selling_price * item.quantity)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-smoked-brown/30 p-4 space-y-3">
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(totals.total)}</span>
              </div>
              <Button
                className="w-full h-14 text-base"
                disabled={cart.length === 0 || sendOrder.isPending}
                onClick={() => sendOrder.mutate()}
              >
                {sendOrder.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Envoyer la commande"
                )}
              </Button>
              <p className="text-center text-xs text-off-white/40">
                Paiement à la caisse · cuisine / bar notifiés
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
