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
  { value: "pending", label: "Pending", color: "bg-yellow-500/20 text-yellow-400" },
  { value: "preparing", label: "Preparing", color: "bg-orange-500/20 text-orange-400" },
  { value: "ready", label: "Ready", color: "bg-green-500/20 text-green-400" },
  { value: "served", label: "Served", color: "bg-blue-500/20 text-blue-400" },
  { value: "completed", label: "Completed", color: "bg-primary/20 text-primary" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/20 text-red-400" },
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
  { value: "kitchen", label: "Kitchen" },
  { value: "grill", label: "Grill" },
  { value: "bar", label: "Bar" },
  { value: "store_keeper", label: "Store Keeper" },
  { value: "client", label: "Tablette client" },
] as const;

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: ["administrator", "manager", "cashier", "store_keeper"] },
  { href: "/pos", label: "POS / Commande", icon: "ShoppingCart", roles: ["administrator", "manager", "cashier"] },
  { href: "/inventory", label: "Inventory", icon: "Package", roles: ["administrator", "manager", "store_keeper"] },
  { href: "/kitchen", label: "Kitchen", icon: "ChefHat", roles: ["administrator", "manager", "kitchen"] },
  { href: "/grill", label: "Grill", icon: "Flame", roles: ["administrator", "manager", "grill"] },
  { href: "/bar", label: "Bar", icon: "Wine", roles: ["administrator", "manager", "bar"] },
  { href: "/orders", label: "Commandes", icon: "ClipboardList", roles: ["administrator", "manager", "cashier"] },
  { href: "/tables", label: "Tables", icon: "Grid3X3", roles: ["administrator", "manager", "cashier"] },
  { href: "/reservations", label: "Reservations", icon: "Calendar", roles: ["administrator", "manager", "cashier"] },
  { href: "/customers", label: "Customers", icon: "Users", roles: ["administrator", "manager", "cashier"] },
  { href: "/suppliers", label: "Suppliers", icon: "Truck", roles: ["administrator", "manager", "store_keeper"] },
  { href: "/purchases", label: "Purchases", icon: "ShoppingBag", roles: ["administrator", "manager", "store_keeper"] },
  { href: "/invoices", label: "Invoices", icon: "FileText", roles: ["administrator", "manager", "cashier"] },
  { href: "/reports", label: "Reports", icon: "BarChart3", roles: ["administrator", "manager"] },
  { href: "/settings", label: "Settings", icon: "Settings", roles: ["administrator", "manager"] },
] as const;
