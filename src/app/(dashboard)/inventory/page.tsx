"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender, type ColumnDef,
} from "@tanstack/react-table";
import { Plus, Search, Download, Package, AlertTriangle, ArrowUpDown, Pencil, ImagePlus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { uploadProductImage } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import type { CategoryType, Product, ProductStatus } from "@/types/database";

const ALLOWED_CATEGORY_TYPES = ["lounge", "grill"] as const;

const EMPTY_FORM = {
  name: "",
  barcode: "",
  category_id: "",
  purchase_price: 0,
  selling_price: 0,
  stock: 0,
  minimum_stock: 5,
  status: "active" as ProductStatus,
  image: null as string | null,
};

function diffLabel(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const fields: [string, string][] = [
    ["name", "Nom"],
    ["barcode", "Code-barres"],
    ["purchase_price", "Prix achat"],
    ["selling_price", "Prix vente"],
    ["stock", "Stock"],
    ["minimum_stock", "Stock min"],
    ["status", "Statut"],
    ["category_id", "Catégorie"],
    ["image", "Photo"],
  ];
  const changes: string[] = [];
  for (const [key, label] of fields) {
    if (before[key] !== after[key]) {
      if (key === "image") {
        changes.push(`${label} modifiée`);
      } else {
        changes.push(`${label}: ${before[key] ?? "—"} → ${after[key] ?? "—"}`);
      }
    }
  }
  return changes.length ? changes.join(", ") : "Aucun changement";
}

export default function InventoryPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockForm, setStockForm] = useState({ type: "IN" as "IN" | "OUT" | "ADJUSTMENT", quantity: 0, reason: "" });
  const [productForm, setProductForm] = useState(EMPTY_FORM);
  const [categoryForm, setCategoryForm] = useState<{ name: string; type: CategoryType }>({
    name: "",
    type: "lounge",
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["inventory-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*, category:categories(name, type)")
        .order("name");
      return (data ?? []) as Product[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .in("type", [...ALLOWED_CATEGORY_TYPES])
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const invalidateProducts = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
    queryClient.invalidateQueries({ queryKey: ["products-pos"] });
  };

  const openCreate = () => {
    setEditingId(null);
    setProductForm(EMPTY_FORM);
    setShowProductDialog(true);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    setProductForm({
      name: product.name,
      barcode: product.barcode ?? "",
      category_id: product.category_id ?? "",
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      stock: product.stock,
      minimum_stock: product.minimum_stock,
      status: product.status,
      image: product.image ?? null,
    });
    setShowProductDialog(true);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Fichier image requis");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop lourde (max 5 Mo)");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const url = await uploadProductImage(
        supabase,
        file,
        editingId ?? `draft-${Date.now()}`
      );
      setProductForm((prev) => ({ ...prev, image: url }));
      toast.success("Photo ajoutée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const stockMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("stock_movements").insert({
        product_id: selectedProduct.id,
        type: stockForm.type,
        quantity: stockForm.quantity,
        reason: stockForm.reason,
        user_id: user?.id,
      });
      if (error) throw error;

      const typeLabel =
        stockForm.type === "IN" ? "Entrée" : stockForm.type === "OUT" ? "Sortie" : "Ajustement";
      await logActivity(supabase, {
        action: "stock",
        entity: "product",
        title: `Stock — ${selectedProduct.name}`,
        message: `${typeLabel} de ${stockForm.quantity}${stockForm.reason ? ` (${stockForm.reason})` : ""}`,
        data: { product_id: selectedProduct.id, type: stockForm.type, quantity: stockForm.quantity },
      });
    },
    onSuccess: () => {
      toast.success("Stock mis à jour");
      setShowStockDialog(false);
      invalidateProducts();
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveProduct = useMutation({
    mutationFn: async () => {
      if (!productForm.name.trim()) throw new Error("Nom requis");

      const payload = {
        name: productForm.name.trim(),
        barcode: productForm.barcode.trim() || null,
        category_id: productForm.category_id || null,
        purchase_price: productForm.purchase_price,
        selling_price: productForm.selling_price,
        stock: productForm.stock,
        minimum_stock: productForm.minimum_stock,
        status: productForm.status,
        image: productForm.image,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const before = products.find((p) => p.id === editingId);
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
        await logActivity(supabase, {
          action: "update",
          entity: "product",
          title: `Produit modifié — ${payload.name}`,
          message: before
            ? diffLabel(before as unknown as Record<string, unknown>, payload as unknown as Record<string, unknown>)
            : "Produit mis à jour",
          data: { product_id: editingId },
        });
      } else {
        const { error } = await supabase.from("products").insert({
          ...payload,
          status: productForm.status || "active",
        });
        if (error) throw error;
        await logActivity(supabase, {
          action: "create",
          entity: "product",
          title: `Nouveau produit — ${payload.name}`,
          message: `Prix vente ${formatCurrency(payload.selling_price)} · stock initial ${payload.stock}`,
          data: { barcode: payload.barcode },
        });
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Produit modifié" : "Produit créé");
      setShowProductDialog(false);
      setEditingId(null);
      setProductForm(EMPTY_FORM);
      invalidateProducts();
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) {
        const isFkError =
          (error as { code?: string }).code === "23503" ||
          /foreign key|constraint/i.test(error.message);
        if (isFkError) {
          throw new Error(
            "Impossible de supprimer ce produit: il est déjà lié à des ventes/achats/stock. Mettez-le sur 'discontinued' ou 'inactive'."
          );
        }
        throw error;
      }

      await logActivity(supabase, {
        action: "delete",
        entity: "product",
        title: `Produit supprimé — ${product.name}`,
        message: `Suppression définitive du produit ${product.name}`,
        data: { product_id: product.id, barcode: product.barcode },
      });
    },
    onSuccess: () => {
      toast.success("Produit supprimé");
      invalidateProducts();
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createCategory = useMutation({
    mutationFn: async () => {
      const name = categoryForm.name.trim();
      if (!name) throw new Error("Nom de catégorie requis");

      const { error } = await supabase.from("categories").insert({
        name,
        type: categoryForm.type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Catégorie créée");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setShowCategoryDialog(false);
      setCategoryForm({ name: "", type: "lounge" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exportCsv = () => {
    const header = "name,barcode,stock,purchase_price,selling_price,status\n";
    const rows = products
      .map((p) =>
        [p.name, p.barcode ?? "", p.stock, p.purchase_price, p.selling_price, p.status]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventaire.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export inventaire téléchargé");
  };

  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: "name",
      header: "Produit",
      cell: ({ row }) => (
        <button type="button" className="flex items-center gap-3 text-left hover:text-primary transition-colors" onClick={() => openEdit(row.original)}>
          <span className="h-10 w-10 shrink-0 rounded-lg bg-smoked-brown/20 overflow-hidden flex items-center justify-center">
            {row.original.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.original.image} alt={row.original.name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-4 w-4 text-off-white/30" />
            )}
          </span>
          <span>
            <span className="block font-medium">{row.original.name}</span>
            <span className="block text-xs text-off-white/40">{row.original.barcode}</span>
          </span>
        </button>
      ),
    },
    {
      accessorKey: "category",
      header: "Catégorie",
      cell: ({ row }) => (
        <Badge variant="secondary" className="capitalize">
          {(row.original as Product & { category?: { name: string } }).category?.name ?? "—"}
        </Badge>
      ),
    },
    {
      accessorKey: "stock",
      header: "Stock",
      cell: ({ row }) => {
        const isLow = row.original.stock <= row.original.minimum_stock;
        return (
          <div className="flex items-center gap-2">
            <span className={isLow ? "text-amber-400 font-bold" : ""}>{row.original.stock}</span>
            {isLow && <AlertTriangle className="h-3 w-3 text-amber-400" />}
          </div>
        );
      },
    },
    {
      accessorKey: "purchase_price",
      header: "Prix achat",
      cell: ({ row }) => formatCurrency(row.original.purchase_price),
    },
    {
      accessorKey: "selling_price",
      header: "Prix vente",
      cell: ({ row }) => formatCurrency(row.original.selling_price),
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "success" : "secondary"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            title="Modifier le produit"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Mouvement de stock"
            onClick={() => {
              setSelectedProduct(row.original);
              setStockForm({ type: "IN", quantity: 0, reason: "" });
              setShowStockDialog(true);
            }}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Supprimer le produit"
            onClick={() => {
              if (!window.confirm(`Supprimer définitivement "${row.original.name}" ?`)) return;
              deleteProduct.mutate(row.original);
            }}
            disabled={deleteProduct.isPending}
          >
            <Trash2 className="h-4 w-4 text-red-400" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    initialState: { pagination: { pageSize: 15 } },
  });

  const lowStockCount = products.filter((p) => p.stock <= p.minimum_stock).length;
  const totalValue = products.reduce((sum, p) => sum + p.stock * p.purchase_price, 0);

  return (
    <div>
      <Header title="Inventaire" subtitle="Créer, modifier et ajuster les stocks" />

      <div className="p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-off-white/50">Total produits</p>
                <p className="text-xl font-bold">{products.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <div>
                <p className="text-sm text-off-white/50">Stock faible</p>
                <p className="text-xl font-bold text-amber-400">{lowStockCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-off-white/50">Valeur totale</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(totalValue)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Exporter
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCategoryDialog(true)}
            >
              <Plus className="h-4 w-4" /> Nouvelle catégorie
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nouveau produit
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-smoked-brown/30">
                    {hg.headers.map((header) => (
                      <th key={header.id} className="text-left p-4 text-sm text-off-white/50 font-medium">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-off-white/40">Chargement...</td></tr>
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-off-white/40">Aucun produit</td></tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-smoked-brown/10 hover:bg-charcoal/40 transition-colors">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-4 text-sm">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-off-white/40">
            Page {table.getState().pagination.pageIndex + 1} sur {table.getPageCount()}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Suivant
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showStockDialog} onOpenChange={setShowStockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mouvement de stock — {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              {(["IN", "OUT", "ADJUSTMENT"] as const).map((type) => (
                <Button
                  key={type}
                  variant={stockForm.type === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStockForm({ ...stockForm, type })}
                >
                  {type === "IN" ? "Entrée" : type === "OUT" ? "Sortie" : "Ajustement"}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Quantité</Label>
              <Input
                type="number"
                value={stockForm.quantity}
                onChange={(e) => setStockForm({ ...stockForm, quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Raison</Label>
              <Input
                value={stockForm.reason}
                onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
                placeholder="Réception, casse, inventaire..."
              />
            </div>
            <Button className="w-full" onClick={() => stockMutation.mutate()} disabled={stockMutation.isPending}>
              Confirmer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showProductDialog}
        onOpenChange={(open) => {
          setShowProductDialog(open);
          if (!open) {
            setEditingId(null);
            setProductForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Photo du produit</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              <div className="flex items-center gap-3">
                <div className="h-20 w-20 shrink-0 rounded-xl bg-smoked-brown/20 overflow-hidden flex items-center justify-center border border-smoked-brown/30">
                  {productForm.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={productForm.image} alt="Aperçu" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="h-6 w-6 text-off-white/30" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {uploading ? "Traitement..." : productForm.image ? "Changer" : "Ajouter une photo"}
                  </Button>
                  {productForm.image && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setProductForm({ ...productForm, image: null })}
                    >
                      <X className="h-4 w-4" /> Retirer
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Code-barres</Label>
              <Input
                value={productForm.barcode}
                onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <select
                className="w-full h-11 rounded-xl bg-charcoal border border-smoked-brown/40 px-3 text-sm"
                value={productForm.category_id}
                onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
              >
                <option value="">Sans catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prix achat</Label>
                <Input
                  type="number"
                  value={productForm.purchase_price}
                  onChange={(e) => setProductForm({ ...productForm, purchase_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Prix vente</Label>
                <Input
                  type="number"
                  value={productForm.selling_price}
                  onChange={(e) => setProductForm({ ...productForm, selling_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{editingId ? "Stock" : "Stock initial"}</Label>
                <Input
                  type="number"
                  value={productForm.stock}
                  onChange={(e) => setProductForm({ ...productForm, stock: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Stock minimum</Label>
                <Input
                  type="number"
                  value={productForm.minimum_stock}
                  onChange={(e) => setProductForm({ ...productForm, minimum_stock: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            {editingId && (
              <div className="space-y-2">
                <Label>Statut</Label>
                <select
                  className="w-full h-11 rounded-xl bg-charcoal border border-smoked-brown/40 px-3 text-sm"
                  value={productForm.status}
                  onChange={(e) => setProductForm({ ...productForm, status: e.target.value as ProductStatus })}
                >
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                  <option value="discontinued">Discontinué</option>
                </select>
              </div>
            )}
            <Button className="w-full" onClick={() => saveProduct.mutate()} disabled={saveProduct.isPending}>
              {saveProduct.isPending ? "Enregistrement..." : editingId ? "Enregistrer les modifications" : "Créer le produit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCategoryDialog}
        onOpenChange={(open) => {
          setShowCategoryDialog(open);
          if (!open) {
            setCategoryForm({ name: "", type: "lounge" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle catégorie</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) =>
                  setCategoryForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Ex: Cocktails, Grill Specials..."
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                className="w-full h-11 rounded-xl bg-charcoal border border-smoked-brown/40 px-3 text-sm"
                value={categoryForm.type}
                onChange={(e) =>
                  setCategoryForm((prev) => ({
                    ...prev,
                    type: e.target.value as CategoryType,
                  }))
                }
              >
                <option value="lounge">Lounge</option>
                <option value="grill">Cuisine / Grill</option>
              </select>
            </div>
            <Button
              className="w-full"
              onClick={() => createCategory.mutate()}
              disabled={createCategory.isPending}
            >
              {createCategory.isPending ? "Création..." : "Créer la catégorie"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
