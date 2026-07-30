"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ScanBarcode, Plus, Minus, Trash2, Printer, Percent, X, ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, calculateTotal, cn } from "@/lib/utils";
import { VAT_RATE } from "@/lib/constants";
import type { Product, Category, CartItem, RestaurantTable } from "@/types/database";

const ALLOWED_CATEGORY_TYPES = ["lounge", "grill"] as const;

function getStation(categoryType?: string): string {
  if (categoryType === "lounge") return "bar";
  return "grill";
}

function POSPageInner() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    const t = searchParams.get("table");
    if (t) {
      const n = parseInt(t, 10);
      if (!Number.isNaN(n)) setTableNumber(n);
    }
  }, [searchParams]);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .in("type", [...ALLOWED_CATEGORY_TYPES])
        .order("name");
      return (data ?? []) as Category[];
    },
  });

  const { data: tables = [] } = useQuery({
    queryKey: ["restaurant-tables"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurant_tables").select("*").order("number");
      return (data ?? []) as RestaurantTable[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-pos", selectedCategory, search],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*, category:categories(*)")
        .eq("status", "active")
        .order("name");
      if (selectedCategory) query = query.eq("category_id", selectedCategory);
      if (search) query = query.or(`name.ilike.%${search}%,barcode.eq.${search}`);
      const { data } = await query;
      return (data ?? []) as Product[];
    },
  });

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const subtotal = cart.reduce((sum, i) => sum + i.product.selling_price * i.quantity, 0);
  const totals = calculateTotal(subtotal, discount, VAT_RATE);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      let resolvedTableId = tableId;
      if (!resolvedTableId && tableNumber != null) {
        const match = tables.find((t) => t.number === tableNumber);
        resolvedTableId = match?.id ?? null;
      }

      // Create the order only — no invoice / stock until payment is validated
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          table_number: tableNumber,
          table_id: resolvedTableId,
          cashier_id: user.id,
          status: "pending",
          payment_method: null,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          notes: "Commande caisse — à encaisser",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.product.selling_price,
        station: getStation(item.product.category?.type),
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      if (resolvedTableId) {
        await supabase
          .from("restaurant_tables")
          .update({ status: "occupied" })
          .eq("id", resolvedTableId);
      }

      return {
        order,
        items: cart.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          price: i.product.selling_price,
        })),
      };
    },
    onSuccess: ({ order, items }) => {
      const receiptData: ReceiptData = {
        title: "Bon de commande",
        orderId: order.id,
        tableNumber,
        createdAt: order.created_at ?? new Date().toISOString(),
        items,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        paymentMethod: null,
        notes: "À encaisser — pas encore en comptabilité",
      };
      setReceipt(receiptData);
      toast.success("Commande créée. Validez le paiement dans Commandes pour la compta.");
      setCart([]);
      setDiscount(0);
      setTableNumber(null);
      setTableId(null);
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-tables"] });
      queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      void printReceipt(receiptData).then((printResult) => {
        if (printResult.via === "bridge") {
          toast.success("Bon imprimé");
          return;
        }
        toast.warning(
          printResult.error
            ? `Impression navigateur — ${printResult.error}`
            : "Impression navigateur: bridge XPrinter indisponible",
          { duration: 8000 }
        );
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && search) {
      const product = products.find(
        (p) => p.barcode === search || p.name.toLowerCase() === search.toLowerCase()
      );
      if (product) {
        addToCart(product);
        setSearch("");
        toast.success(`${product.name} ajouté`);
      } else {
        toast.error("Produit introuvable");
      }
    }
  };

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const selectTable = (t: RestaurantTable) => {
    setTableNumber(t.number);
    setTableId(t.id);
  };

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <Header
        title="Point de Vente"
        subtitle="Créer commande / reçu — la compta n'enregistre qu'après validation du paiement"
      />

      {receipt && <ReceiptPrintView data={receipt} />}

      <div className="flex-1 flex flex-col overflow-hidden no-print min-h-0 tablet-land:flex-row [@media(min-width:1024px)_and_(min-aspect-ratio:5/4)]:flex-row">
        <div className="flex-1 flex flex-col p-3 lg:p-6 square:p-2 short:p-2 overflow-hidden min-h-0 square:flex-[1.15] tablet-land:flex-[1.2]">
          <div className="flex gap-2 lg:gap-3 mb-3 short:mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
              <Input
                ref={searchRef}
                placeholder="Rechercher ou scanner un code-barres..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleBarcodeScan}
                className="pl-10 h-11 short:h-10 text-base"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 short:h-10 short:w-10 shrink-0"
              title="Focus scan code-barres"
              onClick={() => {
                searchRef.current?.focus();
                toast.message("Scannez un code-barres dans le champ de recherche");
              }}
            >
              <ScanBarcode className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex gap-2 mb-3 short:mb-2 overflow-x-auto pb-1 shrink-0">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "px-3 py-1.5 short:px-2.5 short:py-1 rounded-xl text-sm short:text-xs whitespace-nowrap transition-colors",
                !selectedCategory ? "bg-primary text-off-white" : "bg-charcoal text-off-white/60 hover:text-off-white"
              )}
            >
              Tous
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "px-3 py-1.5 short:px-2.5 short:py-1 rounded-xl text-sm short:text-xs whitespace-nowrap transition-colors capitalize",
                  selectedCategory === cat.id ? "bg-primary text-off-white" : "bg-charcoal text-off-white/60 hover:text-off-white"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 tablet-land:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 square:grid-cols-3 short:grid-cols-3 gap-2 lg:gap-3 content-start">
            {products.map((product) => (
              <motion.button
                key={product.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => addToCart(product)}
                className="p-2.5 lg:p-4 short:p-2 rounded-xl lg:rounded-2xl bg-charcoal/80 border border-smoked-brown/30 hover:border-primary/50 hover:bg-charcoal transition-all text-left group min-h-[120px]"
              >
                <div className="aspect-square rounded-lg lg:rounded-xl bg-smoked-brown/20 mb-2 short:mb-1.5 flex items-center justify-center max-h-28 short:max-h-20 square:max-h-24 mx-auto w-full">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover rounded-lg lg:rounded-xl" />
                  ) : (
                    <ShoppingCart className="h-6 w-6 short:h-5 short:w-5 text-off-white/20 group-hover:text-primary/40 transition-colors" />
                  )}
                </div>
                <p className="text-sm short:text-xs font-medium text-off-white truncate">{product.name}</p>
                <p className="text-primary font-bold mt-0.5 text-sm short:text-xs">{formatCurrency(product.selling_price)}</p>
                {product.stock <= product.minimum_stock && (
                  <Badge variant="warning" className="mt-1 text-[10px]">Stock: {product.stock}</Badge>
                )}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="w-full border-t border-smoked-brown/30 bg-charcoal/30 flex flex-col min-h-0 max-h-[42dvh] short:max-h-[45dvh] tablet-land:max-h-none tablet-land:w-[340px] tablet-land:border-t-0 tablet-land:border-l [@media(min-width:1024px)_and_(min-aspect-ratio:5/4)]:max-h-none [@media(min-width:1024px)_and_(min-aspect-ratio:5/4)]:max-w-md [@media(min-width:1024px)_and_(min-aspect-ratio:5/4)]:border-t-0 [@media(min-width:1024px)_and_(min-aspect-ratio:5/4)]:border-l">
          <div className="p-3 lg:p-4 short:p-2 border-b border-smoked-brown/30 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-[family-name:var(--font-cinzel)] text-base lg:text-lg font-bold">Panier</h2>
              <Badge variant="default">{cart.length} articles</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tables.slice(0, 12).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTable(t)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs border transition-colors",
                    tableNumber === t.number
                      ? "bg-primary border-primary text-off-white"
                      : "border-smoked-brown/40 text-off-white/60 hover:border-primary/40"
                  )}
                >
                  T{t.number}
                </button>
              ))}
            </div>
            <Input
              type="number"
              placeholder="N° Table"
              value={tableNumber ?? ""}
              onChange={(e) => {
                const n = e.target.value ? parseInt(e.target.value) : null;
                setTableNumber(n);
                setTableId(tables.find((t) => t.number === n)?.id ?? null);
              }}
              className="h-9 short:h-8"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-3 lg:p-4 short:p-2 space-y-2 min-h-0">
            <AnimatePresence>
              {cart.length === 0 ? (
                <p className="text-center text-off-white/40 py-6 short:py-3 text-sm">
                  Panier vide — ajoutez des produits pour créer une commande
                </p>
              ) : (
                cart.map((item) => (
                  <motion.div
                    key={item.product.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2 p-2 lg:p-3 rounded-xl bg-charcoal/60 border border-smoked-brown/20"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm short:text-xs font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-primary">{formatCurrency(item.product.selling_price)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 rounded-lg hover:bg-smoked-brown/30">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-sm font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 rounded-lg hover:bg-smoked-brown/30">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button onClick={() => updateQuantity(item.product.id, -item.quantity)} className="p-1 text-red-400 hover:bg-red-500/10 rounded-lg">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          <div className="p-3 lg:p-4 short:p-2 border-t border-smoked-brown/30 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-off-white/40" />
              <Input
                type="number"
                placeholder="Remise (FCFA)"
                value={discount || ""}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="h-9 short:h-8"
              />
            </div>

            <div className="space-y-0.5 text-sm short:text-xs">
              <div className="flex justify-between text-off-white/60">
                <span>Sous-total</span><span>{formatCurrency(totals.subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Remise</span><span>-{formatCurrency(discount)}</span>
                </div>
              )}
              {VAT_RATE > 0 && (
                <div className="flex justify-between text-off-white/60">
                  <span>TVA ({VAT_RATE}%)</span><span>{formatCurrency(totals.tax)}</span>
                </div>
              )}
              <div className="flex justify-between text-base lg:text-lg font-bold text-off-white pt-1.5 border-t border-smoked-brown/30">
                <span>Total</span><span className="text-primary">{formatCurrency(totals.total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { setCart([]); setDiscount(0); }} disabled={cart.length === 0}>
                <X className="h-4 w-4" /> Vider
              </Button>
              <Button
                size="lg"
                className="short:h-10"
                onClick={() => checkoutMutation.mutate()}
                disabled={cart.length === 0 || checkoutMutation.isPending}
              >
                <Printer className="h-4 w-4" />
                {checkoutMutation.isPending ? "Envoi..." : "Envoyer commande"}
              </Button>
            </div>
            <p className="text-[11px] text-center text-off-white/40">
              Pas encore en comptabilité — validez le paiement dans Commandes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={<div className="p-8 text-off-white/40">Chargement POS...</div>}>
      <POSPageInner />
    </Suspense>
  );
}
