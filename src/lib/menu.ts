export const TABLE_COUNT = 20;

/** Ordre des catégories lounge (priorité carte bar). */
export const MENU_CATEGORY_ORDER = [
  "Champagnes",
  "Whisky & Bourbon",
  "Cognac & Prestige",
  "Vodka",
  "Autres Spiritueux & Liqueurs",
  "Bières",
  "Vins & Autres",
  "Boissons gazeuses",
  "Boissons",
  "Burgers & Sandwichs",
  "Poulet",
  "Grillades",
  "Mayonnaise",
  "Poissons",
  "Accompagnements",
  "Menu spécial",
] as const;

type ProductOrderEntry = { name: string; price?: number };

/** Ordre exact des produits dans chaque catégorie lounge (comme la carte officielle). */
export const MENU_PRODUCT_ORDER: Record<string, ProductOrderEntry[]> = {
  Champagnes: [
    { name: "Armand de Brignac" },
    { name: "Cristal" },
    { name: "Dom Pérignon Rosé" },
    { name: "Dom Pérignon Brut" },
    { name: "Veuve Rich" },
    { name: "Ruinart Blanc des Blancs" },
    { name: "Moët Nectar" },
    { name: "Ruinart Brut" },
    { name: "Veuve Clicquot Brut" },
    { name: "Laurent Perrier Brut" },
    { name: "Moët Brut" },
  ],
  "Whisky & Bourbon": [
    { name: "Chivas 18 ans" },
    { name: "Glenfiddich 18 ans" },
    { name: "Gold Label" },
    { name: "Platinum Label" },
    { name: "Martell 18 ans" },
    { name: "Glenfiddich 12 ans" },
    { name: "Chivas 15 ans" },
    { name: "Double Black" },
    { name: "Monkey Shoulder" },
    { name: "Chivas 12 ans" },
    { name: "Jack Daniel's 1L" },
    { name: "Jack Daniel's Honey" },
    { name: "Ballantine 12 ans" },
    { name: "Ballantine 15" },
  ],
  "Cognac & Prestige": [
    { name: "Clase Azul" },
    { name: "Hennessy XO" },
    { name: "Martell 18 ans" },
    { name: "Martell 12 ans" },
  ],
  Vodka: [
    { name: "Magnum Belvédère" },
    { name: "Belvedere 75 cl" },
    { name: "Absolut fruitée" },
    { name: "Absolut 1L" },
  ],
  "Autres Spiritueux & Liqueurs": [
    { name: "Baileys", price: 30000 },
    { name: "Martini", price: 30000 },
    { name: "Moscato", price: 30000 },
    { name: "Martini", price: 20000 },
    { name: "Baileys", price: 20000 },
  ],
  Bières: [{ name: "Pack bière (20 bières)" }],
  "Vins & Autres": [
    { name: "Moscato", price: 30000 },
    { name: "Martini", price: 30000 },
    { name: "Baileys", price: 30000 },
  ],
  "Boissons gazeuses": [
    { name: "Fruites" },
    { name: "Tonic" },
    { name: "Sprite" },
    { name: "Red Bull" },
    { name: "Coca-Cola" },
    { name: "Schweppes" },
    { name: "Eau plate – petite" },
    { name: "Eau pétillante – petite" },
    { name: "Eau plate – grande" },
    { name: "Eau pétillante – grande" },
  ],
};

const LOUNGE_CATEGORIES = new Set(Object.keys(MENU_PRODUCT_ORDER));

export function normalizeCategoryName(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "whiskey" || lower === "whisky") return "Whisky & Bourbon";
  if (lower === "autres spiritueux") return "Autres Spiritueux & Liqueurs";
  return name;
}

function normalizeProductName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['']/g, "'")
    .trim();
}

function matchesOrderEntry(
  product: { name: string; selling_price: number },
  entry: ProductOrderEntry
): boolean {
  if (normalizeProductName(product.name) !== normalizeProductName(entry.name)) {
    return false;
  }
  if (entry.price !== undefined) {
    return Math.round(Number(product.selling_price)) === entry.price;
  }
  return true;
}

function categorySortIndex(name: string, type?: string): number {
  const normalized = normalizeCategoryName(name);
  const i = MENU_CATEGORY_ORDER.findIndex(
    (n) => n.toLowerCase() === normalized.toLowerCase()
  );
  if (i >= 0) return i;
  if (type === "lounge") return 40;
  if (type === "grill") return 70;
  return 99;
}

export function sortCategories<T extends { name: string; type?: string }>(cats: T[]): T[] {
  return [...cats].sort((a, b) => {
    const d = categorySortIndex(a.name, a.type) - categorySortIndex(b.name, b.type);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "fr");
  });
}

function productOrderIndex(
  product: { name: string; selling_price: number },
  categoryName: string
): number {
  const cat = normalizeCategoryName(categoryName);
  const order = MENU_PRODUCT_ORDER[cat];
  if (!order) return 9999;

  const idx = order.findIndex((entry) => matchesOrderEntry(product, entry));
  return idx >= 0 ? idx : 9000;
}

export function sortProductsForDisplay<
  P extends { selling_price: number; name: string },
>(products: P[], categoryName: string): P[] {
  const cat = normalizeCategoryName(categoryName);

  if (LOUNGE_CATEGORIES.has(cat)) {
    return [...products].sort((a, b) => {
      const da = productOrderIndex(a, cat);
      const db = productOrderIndex(b, cat);
      if (da !== db) return da - db;
      if (b.selling_price !== a.selling_price) {
        return b.selling_price - a.selling_price;
      }
      return a.name.localeCompare(b.name, "fr");
    });
  }

  return [...products].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function groupProductsByCategory<
  P extends { category_id: string | null; selling_price: number; name: string },
>(
  products: P[],
  categories: { id: string; name: string; type?: string }[]
): { key: string; name: string; products: P[] }[] {
  const sorted = sortCategories(categories);
  const groups: { key: string; name: string; products: P[] }[] = [];
  const seen = new Set<string>();

  for (const cat of sorted) {
    const items = products.filter((p) => p.category_id === cat.id);
    if (!items.length) continue;
    groups.push({
      key: cat.id,
      name: cat.name,
      products: sortProductsForDisplay(items, cat.name),
    });
    seen.add(cat.id);
  }

  const others = products.filter((p) => !p.category_id || !seen.has(p.category_id));
  if (others.length) {
    groups.push({
      key: "autres",
      name: "Autres",
      products: sortProductsForDisplay(others, "Autres"),
    });
  }

  return groups;
}

/** Filtre produits par nom, code-barres, description ou catégorie. */
export function filterProductsBySearch<
  T extends {
    name: string;
    barcode?: string | null;
    description?: string | null;
    category?: { name: string } | null;
  },
>(products: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter((p) => {
    const haystack = [
      p.name,
      p.barcode ?? "",
      p.description ?? "",
      p.category?.name ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
