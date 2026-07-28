export type UserRole =
  | "administrator"
  | "manager"
  | "cashier"
  | "kitchen"
  | "grill"
  | "bar"
  | "store_keeper";

export type CategoryType = "lounge" | "grill";
export type ProductStatus = "active" | "inactive" | "discontinued";
export type StockMovementType = "IN" | "OUT" | "ADJUSTMENT";
export type OrderStatus = "pending" | "preparing" | "ready" | "served" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "orange_money" | "mtn_momo" | "bank_card" | "mixed";
export type TableStatus = "available" | "occupied" | "reserved" | "cleaning";
export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type PurchaseStatus = "pending" | "received" | "cancelled";
export type InvoiceStatus = "draft" | "paid" | "partial" | "cancelled";

export interface Profile {
  id: string;
  fullname: string;
  email: string;
  phone: string | null;
  role: UserRole;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  barcode: string | null;
  image: string | null;
  purchase_price: number;
  selling_price: number;
  stock: number;
  minimum_stock: number;
  category_id: string | null;
  supplier_id: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  category?: Category | null;
}

export interface Supplier {
  id: string;
  company_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_person: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  fullname: string;
  phone: string | null;
  email: string | null;
  loyalty_points: number;
  created_at: string;
}

export interface RestaurantTable {
  id: string;
  number: number;
  status: TableStatus;
  created_at: string;
}

export interface Order {
  id: string;
  table_number: number | null;
  table_id: string | null;
  cashier_id: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  cashier?: Profile;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  notes: string | null;
  station: string | null;
  product?: Product;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string | null;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: PaymentMethod | null;
  status: InvoiceStatus;
  cashier_id: string | null;
  created_at: string;
  customer?: Customer;
  cashier?: Profile;
}

export interface Reservation {
  id: string;
  customer_name: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  status: ReservationStatus;
  table_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  user_id: string | null;
  created_at: string;
  product?: Product;
}

export interface Purchase {
  id: string;
  supplier_id: string | null;
  total: number;
  status: PurchaseStatus;
  created_by: string | null;
  created_at: string;
  supplier?: Supplier;
  purchase_items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  price: number;
  product?: Product;
}

export interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: string;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface DashboardStats {
  today_revenue: number;
  monthly_revenue: number;
  inventory_value: number;
  pending_orders: number;
  low_stock_count: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      categories: { Row: Category; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      products: { Row: Product; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      suppliers: { Row: Supplier; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      customers: { Row: Customer; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      orders: { Row: Order; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      order_items: { Row: OrderItem; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      invoices: { Row: Invoice; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      reservations: { Row: Reservation; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      restaurant_tables: { Row: RestaurantTable; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      stock_movements: { Row: StockMovement; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      purchases: { Row: Purchase; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      purchase_items: { Row: PurchaseItem; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      notifications: { Row: Notification; Insert: Record<string, unknown>; Update: Record<string, unknown> };
    };
    Functions: {
      get_dashboard_stats: { Args: Record<string, never>; Returns: DashboardStats };
      generate_invoice_number: { Args: Record<string, never>; Returns: string };
    };
  };
}
