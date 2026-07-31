"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ScanBarcode, Plus, Minus, Trash2, Percent, X, ShoppingCart,
  ClipboardList, CheckCircle, Banknote, Send,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptPrintView, printReceipt, type ReceiptData } from "@/components/print/receipt";
import { SettlePaymentDialog } from "@/components/orders/settle-payment-dialog";
import { openCashDrawer, shouldOpenCashDrawer } from "@/lib/printer/cash-drawer";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, calculateTotal, cn } from "@/lib/utils";
import { VAT_RATE } from "@/lib/constants";
import type {
  Product,
  Category,
  CartItem,
  RestaurantTable,
  Order,
  OrderItem,
  PaymentSplit,
} from "@/types/database";
import type { SettlePaymentResult } from "@/lib/orders/settle";

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
  const [showPending, setShowPending] = useState(false);
  const [orderToSettle, setOrderToSettle] = useState<PendingOrder | null>(null);
  const [checkoutAction, setCheckoutAction] = useState<"send" | "settle" | null>(null);

  type PendingOrder = Order;

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

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["pos-pending-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, product:products(name))")
        .in("status", ["pending", "preparing", "ready", "served"])
        .is("payment_method", null)
        .order("created_at", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as PendingOrder[];
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const orderId = searchParams.get("order");
    if (!orderId || orderToSettle) return;
    const match = pendingOrders.find((order) => order.id === orderId);
    if (match) setOrderToSettle(match);
  }, [searchParams, pendingOrders, orderToSettle]);

  useEffect(() => {
    const channel = supabase
      .channel("pos-pending-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => queryClient.invalidateQueries({ queryKey: ["pos-pending-orders"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => queryClient.invalidateQueries({ queryKey: ["pos-pending-orders"] })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, queryClient]);

  const handlePaidFromPos = (
    order: PendingOrder,
    result: SettlePaymentResult,
    payments: PaymentSplit[]
  ) => {
    const receiptData: ReceiptData = {
      title: "Ticket de caisse",
      invoiceNumber: result.invoice_number,
      orderId: order.id,
      tableNumber: order.table_number,
      createdAt: new Date().toISOString(),
      items: (order.order_items ?? []).map((item) => ({
        name: item.product?.name ?? "Article",
        quantity: item.quantity,
        price: item.price,
      })),
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      paymentMethod: result.payment_method,
      paymentSplits: payments,
      amountReceived: result.amount_received,
      changeDue: result.change_due,
    };
    setReceipt(receiptData);
    setOrderToSettle(null);
    queryClient.invalidateQueries({ queryKey: ["pos-pending-orders"] });
    queryClient.invalidateQueries({ queryKey: ["all-orders"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    toast.success(
      result.change_due > 0
        ? `Paiement validé — rendre ${formatCurrency(result.change_due)}`
        : "Paiement validé et comptabilisé"
    );
    void printReceipt(receiptData).then((printResult) => {
      if (printResult.via !== "bridge" && result.has_cash && shouldOpenCashDrawer("cash")) {
        void openCashDrawer();
      }
    });
  };

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
    mutationFn: async (action: "send" | "settle") => {
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

      const { data: insertedItems, error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems)
        .select();
      if (itemsError) throw itemsError;

      if (resolvedTableId) {
        await supabase
          .from("restaurant_tables")
          .update({ status: "occupied" })
          .eq("id", resolvedTableId);
      }

      return {
        action,
        order,
        orderItems: (insertedItems ?? []).map((item) => ({
          ...item,
          product: cart.find((cartItem) => cartItem.product.id === item.product_id)?.product,
        })) as OrderItem[],
      };
    },
    onSuccess: ({ action, order, orderItems }) => {
      const pendingOrder: PendingOrder = {
        ...(order as Order),
        order_items: orderItems,
      };

      setCart([]);
      setDiscount(0);
      setTableNumber(null);
      setTableId(null);
      setCheckoutAction(null);
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-tables"] });
      queryClient.invalidateQueries({ queryKey: ["all-orders"] });
      queryClient.invalidateQueries({ queryKey: ["pos-pending-orders"] });

      if (action === "settle") {
        setOrderToSettle(pendingOrder);
        toast.success("Commande créée — choisissez le paiement");
        return;
      }

      toast.success("Commande envoyée en cuisine — aucune facture imprimée");
    },
    onError: (err: Error) => {
      setCheckoutAction(null);
      toast.error(err.message);
    },
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
      <div className="relative">
        <Header
          title="Point de Vente"
          subtitle="Créer ou encaisser les commandes reçues des tablettes"
        />
        <Button
          type="button"
          onClick={() => setShowPending(true)}
          className="absolute right-14 lg:right-20 top-3 lg:top-4 h-10"
          variant={pendingOrders.length > 0 ? "default" : "outline"}
        >
          <ClipboardList className="h-4 w-4" />
          <span className="hidden sm:inline">À encaisser</span>
          {pendingOrders.length > 0 && (
            <Badge variant="secondary" className="ml-1 bg-black/30 text-off-white">
              {pendingOrders.length}
            </Badge>
          )}
        </Button>
      </div>

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
              <Button
                variant="outline"
                onClick={() => {
                  setCheckoutAction("send");
                  checkoutMutation.mutate("send");
                }}
                disabled={cart.length === 0 || checkoutMutation.isPending}
              >
                <Send className="h-4 w-4" />
                {checkoutMutation.isPending && checkoutAction === "send"
                  ? "Envoi..."
                  : "Envoyer sans facture"}
              </Button>
              <Button
                size="lg"
                className="short:h-10"
                onClick={() => {
                  setCheckoutAction("settle");
                  checkoutMutation.mutate("settle");
                }}
                disabled={cart.length === 0 || checkoutMutation.isPending}
              >
                <Banknote className="h-4 w-4" />
                {checkoutMutation.isPending && checkoutAction === "settle"
                  ? "Création..."
                  : "Encaisser"}
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full h-8 text-off-white/50"
              onClick={() => {
                setCart([]);
                setDiscount(0);
              }}
              disabled={cart.length === 0 || checkoutMutation.isPending}
            >
                <X className="h-4 w-4" /> Vider
            </Button>
            <p className="text-[11px] text-center text-off-white/40">
              Envoyer = cuisine seulement · Encaisser = paiement et facture immédiats
            </p>
          </div>
        </div>
      </div>

      <Dialog open={showPending} onOpenChange={setShowPending}>
        <DialogContent className="no-print max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Commandes reçues — à encaisser</DialogTitle>
          </DialogHeader>
          {pendingOrders.length === 0 ? (
            <p className="text-center text-off-white/40 py-10">
              Aucune commande à encaisser
            </p>
          ) : (
            <div className="space-y-3">
              {pendingOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl border border-smoked-brown/30 bg-black/30 p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-lg">Table {order.table_number ?? "—"}</p>
                      {order.notes?.toLowerCase().includes("menu public") && (
                        <Badge>Menu public</Badge>
                      )}
                      {order.notes?.toLowerCase().includes("tablette") && (
                        <Badge>Tablette</Badge>
                      )}
                    </div>
                    <p className="text-xs text-off-white/50 mt-1">
                      {(order.order_items ?? [])
                        .map((item) => `${item.product?.name ?? "Article"} ×${item.quantity}`)
                        .join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-primary">{formatCurrency(order.total)}</p>
                    <Button
                      onClick={() => {
                        setShowPending(false);
                        setOrderToSettle(order);
                      }}
                    >
                      <CheckCircle className="h-4 w-4" /> Encaisser
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SettlePaymentDialog
        order={orderToSettle}
        open={!!orderToSettle}
        onOpenChange={(open) => !open && setOrderToSettle(null)}
        onPaid={(order, result, payments) =>
          handlePaidFromPos(order as PendingOrder, result, payments)
        }
      />
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
