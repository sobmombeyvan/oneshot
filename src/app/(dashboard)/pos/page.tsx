"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ScanBarcode, Plus, Minus, Trash2, CreditCard, Banknote,
  Smartphone, Printer, Percent, X, ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, calculateTotal, generateInvoiceNumber, cn } from "@/lib/utils";
import { VAT_RATE, PAYMENT_METHODS } from "@/lib/constants";
import type { Product, Category, CartItem, PaymentMethod, RestaurantTable } from "@/types/database";

function getStation(categoryType?: string): string {
  if (categoryType === "grill") return "grill";
  if (categoryType === "lounge") return "bar";
  return "kitchen";
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
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("cash");
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
      const { data } = await supabase.from("categories").select("*").order("name");
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

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          table_number: tableNumber,
          table_id: resolvedTableId,
          cashier_id: user.id,
          status: "pending",
          payment_method: selectedPayment,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
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

      const invoiceNumber = generateInvoiceNumber();
      await supabase.from("invoices").insert({
        invoice_number: invoiceNumber,
        order_id: order.id,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        payment_method: selectedPayment,
        status: "paid",
        cashier_id: user.id,
      });

      for (const item of cart) {
        await supabase.from("stock_movements").insert({
          product_id: item.product.id,
          type: "OUT",
          quantity: item.quantity,
          reason: `POS Order #${order.id.slice(0, 8)}`,
          user_id: user.id,
        });
      }

      if (resolvedTableId) {
        await supabase
          .from("restaurant_tables")
          .update({ status: "occupied" })
          .eq("id", resolvedTableId);
      }

      return {
        order,
        invoiceNumber,
        items: cart.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          price: i.product.selling_price,
        })),
      };
    },
    onSuccess: ({ order, invoiceNumber, items }) => {
      const receiptData: ReceiptData = {
        title: "Ticket de caisse",
        invoiceNumber,
        orderId: order.id,
        tableNumber,
        createdAt: order.created_at ?? new Date().toISOString(),
        items,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        paymentMethod: selectedPayment,
      };
      setReceipt(receiptData);
      toast.success("Commande envoyée en cuisine !");
      setCart([]);
      setDiscount(0);
      setTableNumber(null);
      setTableId(null);
      setShowPayment(false);
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-tables"] });
      queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      printReceipt();
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

  const paymentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    cash: Banknote, orange_money: Smartphone, mtn_momo: Smartphone, bank_card: CreditCard,
  };

  const selectTable = (t: RestaurantTable) => {
    setTableNumber(t.number);
    setTableId(t.id);
  };

  return (
    <div className="h-screen flex flex-col">
      <Header title="Point de Vente" subtitle="Créer une commande — envoi auto cuisine / grill / bar" />

      {receipt && <ReceiptPrintView data={receipt} />}

      <div className="flex-1 flex overflow-hidden no-print">
        <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
              <Input
                ref={searchRef}
                placeholder="Rechercher ou scanner un code-barres..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleBarcodeScan}
                className="pl-10 h-12 text-base"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0"
              title="Focus scan code-barres"
              onClick={() => {
                searchRef.current?.focus();
                toast.message("Scannez un code-barres dans le champ de recherche");
              }}
            >
              <ScanBarcode className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-colors",
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
                  "px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-colors capitalize",
                  selectedCategory === cat.id ? "bg-primary text-off-white" : "bg-charcoal text-off-white/60 hover:text-off-white"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 content-start">
            {products.map((product) => (
              <motion.button
                key={product.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => addToCart(product)}
                className="p-4 rounded-2xl bg-charcoal/80 border border-smoked-brown/30 hover:border-primary/50 hover:bg-charcoal transition-all text-left group"
              >
                <div className="aspect-square rounded-xl bg-smoked-brown/20 mb-3 flex items-center justify-center">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <ShoppingCart className="h-8 w-8 text-off-white/20 group-hover:text-primary/40 transition-colors" />
                  )}
                </div>
                <p className="text-sm font-medium text-off-white truncate">{product.name}</p>
                <p className="text-primary font-bold mt-1">{formatCurrency(product.selling_price)}</p>
                {product.stock <= product.minimum_stock && (
                  <Badge variant="warning" className="mt-2 text-[10px]">Stock: {product.stock}</Badge>
                )}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md border-l border-smoked-brown/30 bg-charcoal/30 flex flex-col">
          <div className="p-4 border-b border-smoked-brown/30">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-[family-name:var(--font-cinzel)] text-lg font-bold">Panier</h2>
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
              className="h-10"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence>
              {cart.length === 0 ? (
                <p className="text-center text-off-white/40 py-12">
                  Panier vide — ajoutez des produits pour créer une commande
                </p>
              ) : (
                cart.map((item) => (
                  <motion.div
                    key={item.product.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-charcoal/60 border border-smoked-brown/20"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-primary">{formatCurrency(item.product.selling_price)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 rounded-lg hover:bg-smoked-brown/30">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
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

          <div className="p-4 border-t border-smoked-brown/30 space-y-3">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-off-white/40" />
              <Input
                type="number"
                placeholder="Remise (FCFA)"
                value={discount || ""}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="h-9"
              />
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-off-white/60">
                <span>Sous-total</span><span>{formatCurrency(totals.subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Remise</span><span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-off-white/60">
                <span>TVA ({VAT_RATE}%)</span><span>{formatCurrency(totals.tax)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-off-white pt-2 border-t border-smoked-brown/30">
                <span>Total</span><span className="text-primary">{formatCurrency(totals.total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { setCart([]); setDiscount(0); }} disabled={cart.length === 0}>
                <X className="h-4 w-4" /> Annuler
              </Button>
              <Button size="lg" onClick={() => setShowPayment(true)} disabled={cart.length === 0}>
                Payer
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-md no-print">
          <DialogHeader>
            <DialogTitle>Paiement — {formatCurrency(totals.total)}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {PAYMENT_METHODS.map((method) => {
              const Icon = paymentIcons[method.value] ?? CreditCard;
              return (
                <button
                  key={method.value}
                  onClick={() => setSelectedPayment(method.value as PaymentMethod)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                    selectedPayment === method.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-smoked-brown/30 text-off-white/60 hover:border-primary/30"
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs font-medium">{method.label}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setShowPayment(false)}>Retour</Button>
            <Button onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending}>
              <Printer className="h-4 w-4" />
              {checkoutMutation.isPending ? "Traitement..." : "Confirmer & Imprimer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
