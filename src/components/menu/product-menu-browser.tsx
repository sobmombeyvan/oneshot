"use client";

import { useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { Search, ShoppingCart, UtensilsCrossed, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import {
  filterProductsBySearch,
  groupProductsByCategory,
  sortCategories,
} from "@/lib/menu";
import type { Category, Product } from "@/types/database";

export type MenuBrowseProduct = Pick<
  Product,
  | "id"
  | "name"
  | "description"
  | "barcode"
  | "selling_price"
  | "image"
  | "stock"
  | "minimum_stock"
  | "category_id"
> & {
  category?: Product["category"];
};

interface ProductMenuBrowserProps<P extends MenuBrowseProduct = MenuBrowseProduct> {
  products: P[];
  categories: Category[];
  onAdd: (product: P) => void;
  isLoading?: boolean;
  variant?: "pos" | "catalog";
  showStock?: boolean;
  searchPlaceholder?: string;
  className?: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onSearchEnter?: (query: string) => void;
}

function ProductCard({
  product,
  onAdd,
  variant,
  showStock,
}: {
  product: MenuBrowseProduct;
  onAdd: () => void;
  variant: "pos" | "catalog";
  showStock?: boolean;
}) {
  const lowStock =
    showStock &&
    product.stock != null &&
    product.minimum_stock != null &&
    product.stock <= product.minimum_stock;

  if (variant === "pos") {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="p-2.5 lg:p-3 rounded-xl bg-charcoal/80 border border-smoked-brown/30 hover:border-primary/50 hover:bg-charcoal transition-all text-left group min-h-[108px]"
      >
        <div className="rounded-lg bg-smoked-brown/20 mb-2 h-16 flex items-center justify-center overflow-hidden">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <ShoppingCart className="h-5 w-5 text-off-white/20 group-hover:text-primary/40" />
          )}
        </div>
        <p className="text-sm font-medium text-off-white line-clamp-2 leading-snug">
          {product.name}
        </p>
        {product.description && (
          <p className="text-[10px] text-off-white/40 line-clamp-1 mt-0.5">
            {product.description}
          </p>
        )}
        <p className="text-primary font-bold mt-1 text-sm">{formatCurrency(product.selling_price)}</p>
        {lowStock && (
          <Badge variant="warning" className="mt-1 text-[10px]">
            Stock: {product.stock}
          </Badge>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      className="text-left rounded-2xl border border-smoked-brown/30 bg-charcoal/50 p-3 sm:p-4 hover:border-primary/50 active:scale-[0.98] transition flex flex-col h-full"
    >
      <div className="h-24 sm:h-32 rounded-xl bg-smoked-brown/20 mb-3 overflow-hidden flex items-center justify-center shrink-0">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt="" className="w-full h-full object-cover" />
        ) : (
          <UtensilsCrossed className="h-8 w-8 text-off-white/20" />
        )}
      </div>
      <h2 className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 flex-1">
        {product.name}
      </h2>
      {product.description && (
        <p className="text-xs text-off-white/45 mt-1 line-clamp-2">{product.description}</p>
      )}
      <p className="text-primary font-bold mt-2 text-base sm:text-lg">
        {formatCurrency(product.selling_price)}
      </p>
      <span className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary/15 text-primary text-sm font-medium">
        <Plus className="h-4 w-4 mr-1" /> Ajouter
      </span>
    </button>
  );
}

const gridClass = {
  pos: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-3",
  catalog:
    "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4",
};

export function ProductMenuBrowser<P extends MenuBrowseProduct = MenuBrowseProduct>({
  products,
  categories,
  onAdd,
  isLoading = false,
  variant = "catalog",
  showStock = false,
  searchPlaceholder = "Rechercher un produit, catégorie ou code-barres…",
  className,
  searchInputRef,
  onSearchEnter,
}: ProductMenuBrowserProps<P>) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const sortedCategories = useMemo(() => sortCategories(categories), [categories]);

  const visibleCategories = useMemo(() => {
    const used = new Set(products.map((p) => p.category_id).filter(Boolean));
    return sortedCategories.filter((c) => used.has(c.id));
  }, [products, sortedCategories]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (categoryId) list = list.filter((p) => p.category_id === categoryId);
    return filterProductsBySearch(list, search);
  }, [products, categoryId, search]);

  const productGroups = useMemo(() => {
    if (categoryId || search.trim()) return null;
    return groupProductsByCategory(filteredProducts, visibleCategories);
  }, [filteredProducts, visibleCategories, categoryId, search]);

  const resultCount = filteredProducts.length;

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <div className="shrink-0 space-y-2.5 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40 pointer-events-none" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter" && onSearchEnter) {
                onSearchEnter(search);
              }
            }}
            placeholder={searchPlaceholder}
            className="pl-10 pr-10 h-11 text-base"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-off-white/50 hover:text-off-white hover:bg-charcoal"
              aria-label="Effacer la recherche"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-thin">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            className={cn(
              "shrink-0 h-10 px-4 rounded-full text-sm font-medium border transition-colors",
              categoryId === null
                ? "bg-primary text-black border-primary"
                : "border-smoked-brown/40 text-off-white/70 hover:border-primary/40"
            )}
          >
            Tout
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryId(cat.id)}
              className={cn(
                "shrink-0 h-10 px-4 rounded-full text-sm font-medium border transition-colors whitespace-nowrap",
                categoryId === cat.id
                  ? "bg-primary text-black border-primary"
                  : "border-smoked-brown/40 text-off-white/70 hover:border-primary/40"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {(search || categoryId) && (
          <p className="text-xs text-off-white/45 px-1">
            {resultCount} résultat{resultCount !== 1 ? "s" : ""}
            {search ? ` pour « ${search} »` : ""}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : resultCount === 0 ? (
          <div className="text-center py-16 px-4">
            <Search className="h-10 w-10 text-off-white/20 mx-auto mb-3" />
            <p className="text-off-white/50">Aucun produit trouvé</p>
            <p className="text-sm text-off-white/30 mt-1">
              Essayez un autre mot ou effacez les filtres
            </p>
            {(search || categoryId) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryId(null);
                }}
                className="mt-4 text-sm text-primary underline"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : productGroups ? (
          <div className="space-y-6">
            {productGroups.map((group) => (
              <section key={group.key} id={`menu-cat-${group.key}`}>
                <h3
                  className={cn(
                    "sticky top-0 z-10 mb-2.5 px-2 py-1.5 font-semibold tracking-wide bg-black/95 backdrop-blur-sm border-b border-smoked-brown/20",
                    variant === "pos"
                      ? "text-[11px] uppercase text-off-white/45"
                      : "text-base text-primary font-[family-name:var(--font-cinzel)]"
                  )}
                >
                  {group.name}
                  <span className="ml-2 text-off-white/30 font-normal">
                    ({group.products.length})
                  </span>
                </h3>
                <div className={gridClass[variant]}>
                  {group.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      variant={variant}
                      showStock={showStock}
                      onAdd={() => onAdd(product)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={gridClass[variant]}>
            {filteredProducts.map((product) => (
              <div key={product.id} className="relative">
                {search && product.category?.name && (
                  <span className="absolute top-2 left-2 z-10 text-[10px] px-1.5 py-0.5 rounded-md bg-black/70 text-off-white/60 max-w-[85%] truncate">
                    {product.category.name}
                  </span>
                )}
                <ProductCard
                  product={product}
                  variant={variant}
                  showStock={showStock}
                  onAdd={() => onAdd(product)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
