import type { UserRole } from "@/types/database";

type Permission =
  | "dashboard.view"
  | "pos.access"
  | "pos.discount"
  | "inventory.view"
  | "inventory.manage"
  | "inventory.adjust"
  | "orders.view"
  | "orders.create"
  | "orders.update"
  | "orders.cancel"
  | "kitchen.view"
  | "grill.view"
  | "bar.view"
  | "customers.view"
  | "customers.manage"
  | "suppliers.view"
  | "suppliers.manage"
  | "purchases.view"
  | "purchases.manage"
  | "invoices.view"
  | "invoices.create"
  | "cash.view"
  | "cash.manage"
  | "reports.view"
  | "reports.export"
  | "users.view"
  | "users.manage"
  | "settings.manage"
  | "ai.access";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  administrator: [
    "dashboard.view", "pos.access", "pos.discount", "inventory.view", "inventory.manage",
    "inventory.adjust", "orders.view", "orders.create", "orders.update", "orders.cancel",
    "kitchen.view", "grill.view", "bar.view", "customers.view", "customers.manage",
    "suppliers.view", "suppliers.manage", "purchases.view", "purchases.manage",
    "invoices.view", "invoices.create", "cash.view", "cash.manage",
    "reports.view", "reports.export",
    "users.view", "users.manage", "settings.manage", "ai.access",
  ],
  manager: [
    "dashboard.view", "pos.access", "pos.discount", "inventory.view", "inventory.manage",
    "inventory.adjust", "orders.view", "orders.create", "orders.update", "orders.cancel",
    "kitchen.view", "grill.view", "bar.view", "customers.view", "customers.manage",
    "suppliers.view", "suppliers.manage", "purchases.view", "purchases.manage",
    "invoices.view", "invoices.create", "cash.view", "cash.manage",
    "reports.view", "reports.export", "ai.access",
  ],
  cashier: [
    "dashboard.view", "pos.access", "orders.view", "orders.create", "orders.update",
    "customers.view", "customers.manage", "invoices.view", "invoices.create",
    "cash.view", "cash.manage",
  ],
  kitchen: ["kitchen.view", "orders.view", "orders.update"],
  // Same as kitchen — restaurant treats grill and cuisine as one station
  grill: ["kitchen.view", "grill.view", "orders.view", "orders.update"],
  bar: ["bar.view", "orders.view", "orders.update"],
  store_keeper: [
    "dashboard.view", "inventory.view", "inventory.manage", "inventory.adjust",
    "suppliers.view", "purchases.view", "purchases.manage",
  ],
  client: ["orders.create"],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAccessRoute(role: UserRole, routeRoles: readonly string[]): boolean {
  return routeRoles.includes(role);
}

export function getDefaultRoute(role: UserRole): string {
  const routes: Record<UserRole, string> = {
    administrator: "/dashboard",
    manager: "/dashboard",
    cashier: "/pos",
    kitchen: "/kitchen",
    grill: "/kitchen",
    bar: "/bar",
    store_keeper: "/inventory",
    client: "/menu",
  };
  return routes[role] ?? "/dashboard";
}

export function isClientRole(role: UserRole): boolean {
  return role === "client";
}
