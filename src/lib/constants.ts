export const BRAND = {
  name: "ONE SHOT",
  subtitle: "Lounge & Grill",
  appName: "ONE SHOT Manager",
  colors: {
    primary: "#C66A24",
    black: "#050505",
    offWhite: "#E9E3D8",
    smokedBrown: "#4A2B1A",
    charcoal: "#2B2B2B",
  },
} as const;

export const VAT_RATE = 0;

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: "Banknote" },
  { value: "orange_money", label: "Orange Money", icon: "Smartphone" },
  { value: "mtn_momo", label: "MTN MoMo", icon: "Smartphone" },
  { value: "bank_card", label: "Bank Card", icon: "CreditCard" },
  { value: "mixed", label: "Mixed Payment", icon: "Layers" },
] as const;

export const ORDER_STATUSES = [
  { value: "pending", label: "En attente", color: "bg-yellow-500/20 text-yellow-400" },
  { value: "preparing", label: "En préparation", color: "bg-orange-500/20 text-orange-400" },
  { value: "ready", label: "Prête", color: "bg-green-500/20 text-green-400" },
  { value: "served", label: "Servie", color: "bg-blue-500/20 text-blue-400" },
  { value: "completed", label: "Payée", color: "bg-primary/20 text-primary" },
  { value: "cancelled", label: "Annulée", color: "bg-red-500/20 text-red-400" },
] as const;

export const TABLE_STATUSES = [
  { value: "available", label: "Available", color: "bg-emerald-500/20 text-emerald-400" },
  { value: "occupied", label: "Occupied", color: "bg-primary/20 text-primary" },
  { value: "reserved", label: "Reserved", color: "bg-amber-500/20 text-amber-400" },
  { value: "cleaning", label: "Cleaning", color: "bg-slate-500/20 text-slate-400" },
] as const;

export const USER_ROLES = [
  { value: "administrator", label: "Administrator" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "kitchen", label: "Cuisine" },
  { value: "grill", label: "Cuisine" },
  { value: "bar", label: "Bar" },
  { value: "store_keeper", label: "Store Keeper" },
  { value: "client", label: "Tablette client" },
] as const;

export const NAV_SECTIONS = [
  {
    id: "overview",
    label: "Vue d'ensemble",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: "LayoutDashboard", roles: ["administrator", "manager", "cashier", "store_keeper"] },
    ],
  },
  {
    id: "service",
    label: "Service",
    items: [
      { href: "/pos", label: "POS", icon: "ShoppingCart", roles: ["administrator", "manager", "cashier"] },
      { href: "/orders", label: "Commandes", icon: "ClipboardList", roles: ["administrator", "manager", "cashier"] },
      { href: "/tables", label: "Tables", icon: "Grid3X3", roles: ["administrator", "manager", "cashier"] },
      { href: "/reservations", label: "Réservations", icon: "Calendar", roles: ["administrator", "manager", "cashier"] },
    ],
  },
  {
    id: "caisse",
    label: "Caisse",
    items: [
      { href: "/cash", label: "Caisse", icon: "Banknote", roles: ["administrator", "manager", "cashier"] },
      { href: "/invoices", label: "Factures", icon: "FileText", roles: ["administrator", "manager", "cashier"] },
      { href: "/customers", label: "Clients", icon: "Users", roles: ["administrator", "manager", "cashier"] },
    ],
  },
  {
    id: "cuisine",
    label: "Cuisine",
    items: [
      { href: "/kitchen", label: "Cuisine", icon: "ChefHat", roles: ["administrator", "manager", "kitchen", "grill"] },
      { href: "/bar", label: "Bar", icon: "Wine", roles: ["administrator", "manager", "bar"] },
    ],
  },
  {
    id: "stock",
    label: "Stock",
    items: [
      { href: "/inventory", label: "Inventaire", icon: "Package", roles: ["administrator", "manager", "store_keeper"] },
      { href: "/purchases", label: "Achats", icon: "ShoppingBag", roles: ["administrator", "manager", "store_keeper"] },
      { href: "/suppliers", label: "Fournisseurs", icon: "Truck", roles: ["administrator", "manager", "store_keeper"] },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { href: "/reports", label: "Rapports", icon: "BarChart3", roles: ["administrator", "manager"] },
      { href: "/settings", label: "Paramètres", icon: "Settings", roles: ["administrator", "manager"] },
    ],
  },
] as const;

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);
