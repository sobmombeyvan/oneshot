import type {
  Category,
  Customer,
  Invoice,
  Notification,
  Order,
  OrderItem,
  Product,
  Profile,
  Purchase,
  PurchaseItem,
  Reservation,
  RestaurantTable,
  StockMovement,
  Supplier,
} from "@/types/database";
import { DEMO_USER } from "./config";

const now = Date.now();
const iso = (msAgo = 0) => new Date(now - msAgo).toISOString();

export interface DemoStore {
  profiles: Profile[];
  categories: Category[];
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  restaurant_tables: RestaurantTable[];
  orders: Order[];
  order_items: OrderItem[];
  invoices: Invoice[];
  reservations: Reservation[];
  stock_movements: StockMovement[];
  purchases: Purchase[];
  purchase_items: PurchaseItem[];
  notifications: Notification[];
}

export function createInitialStore(): DemoStore {
  const cat = (id: string, name: string, type: Category["type"]): Category => ({
    id,
    name,
    type,
    created_at: iso(86_400_000 * 30),
  });

  const categories: Category[] = [
    cat("cat-1", "Cocktails", "lounge"),
    cat("cat-2", "Beer", "lounge"),
    cat("cat-3", "Soft Drinks", "lounge"),
    cat("cat-4", "Wine", "lounge"),
    cat("cat-5", "Shots", "lounge"),
    cat("cat-6", "Grill Specials", "grill"),
    cat("cat-7", "Steaks", "grill"),
    cat("cat-8", "Burgers", "grill"),
    cat("cat-9", "Snacks", "snack"),
    cat("cat-10", "Appetizers", "snack"),
  ];

  const prod = (
    id: string,
    name: string,
    description: string,
    barcode: string,
    purchase: number,
    selling: number,
    stock: number,
    min: number,
    category_id: string
  ): Product => ({
    id,
    name,
    description,
    barcode,
    image: null,
    purchase_price: purchase,
    selling_price: selling,
    stock,
    minimum_stock: min,
    category_id,
    supplier_id: null,
    status: "active",
    created_at: iso(86_400_000 * 20),
    updated_at: iso(86_400_000),
  });

  const products: Product[] = [
    prod("prod-1", "Mojito Classic", "Fresh mint, lime, rum", "OS001001", 800, 3500, 50, 10, "cat-1"),
    prod("prod-2", "Old Fashioned", "Bourbon, bitters, orange", "OS001002", 1200, 4500, 40, 10, "cat-1"),
    prod("prod-3", "Castel Beer", "330ml bottle", "OS002001", 400, 1500, 120, 24, "cat-2"),
    prod("prod-4", "Heineken", "330ml bottle", "OS002002", 500, 1800, 96, 24, "cat-2"),
    prod("prod-5", "Coca-Cola", "330ml can", "OS003001", 200, 800, 200, 48, "cat-3"),
    prod("prod-6", "Red Wine Glass", "House red wine", "OS004001", 1500, 4000, 30, 6, "cat-4"),
    prod("prod-7", "Tequila Shot", "Premium tequila 40ml", "OS005001", 600, 2000, 60, 12, "cat-5"),
    prod("prod-8", "Grilled Ribeye", "300g premium ribeye", "OS006001", 3500, 12000, 8, 5, "cat-6"),
    prod("prod-9", "Mixed Grill Platter", "Assorted grilled meats", "OS006002", 5000, 18000, 4, 3, "cat-6"),
    prod("prod-10", "Classic Burger", "Beef patty, cheese, fries", "OS007001", 1200, 4500, 40, 10, "cat-8"),
    prod("prod-11", "Chicken Wings", "Spicy buffalo wings", "OS008001", 800, 3500, 50, 10, "cat-9"),
    prod("prod-12", "Loaded Nachos", "Cheese, jalapeños, salsa", "OS009001", 600, 3000, 6, 8, "cat-10"),
    prod("prod-13", "T-Bone Steak", "450g aged beef", "OS007002", 4500, 15000, 12, 4, "cat-7"),
    prod("prod-14", "Sprite", "330ml can", "OS003002", 200, 800, 180, 48, "cat-3"),
  ];

  const suppliers: Supplier[] = [
    {
      id: "sup-1",
      company_name: "Fresh Foods Ltd",
      phone: "+237 670 111 222",
      email: "orders@freshfoods.cm",
      address: "Douala, Cameroon",
      contact_person: "Jean Dupont",
      created_at: iso(86_400_000 * 40),
    },
    {
      id: "sup-2",
      company_name: "Beverage Supply Co",
      phone: "+237 670 333 444",
      email: "sales@bevsupply.cm",
      address: "Yaoundé, Cameroon",
      contact_person: "Marie Claire",
      created_at: iso(86_400_000 * 35),
    },
    {
      id: "sup-3",
      company_name: "Grill Provisions",
      phone: "+237 670 555 666",
      email: "info@grillpro.cm",
      address: "Douala, Cameroon",
      contact_person: "Paul Nkoulou",
      created_at: iso(86_400_000 * 30),
    },
  ];

  products[7].supplier_id = "sup-3";
  products[8].supplier_id = "sup-3";
  products[0].supplier_id = "sup-2";
  products[2].supplier_id = "sup-2";

  const restaurant_tables: RestaurantTable[] = Array.from({ length: 12 }, (_, i) => ({
    id: `table-${i + 1}`,
    number: i + 1,
    status: (i === 2 || i === 5 ? "occupied" : i === 8 ? "reserved" : "available") as RestaurantTable["status"],
    created_at: iso(86_400_000 * 60),
  }));

  const customers: Customer[] = [
    {
      id: "cust-1",
      fullname: "Amina Fouda",
      phone: "+237 690 100 200",
      email: "amina@email.cm",
      loyalty_points: 120,
      created_at: iso(86_400_000 * 15),
    },
    {
      id: "cust-2",
      fullname: "Eric Mbarga",
      phone: "+237 690 300 400",
      email: "eric@email.cm",
      loyalty_points: 45,
      created_at: iso(86_400_000 * 10),
    },
    {
      id: "cust-3",
      fullname: "Sophie Nguema",
      phone: "+237 690 500 600",
      email: null,
      loyalty_points: 0,
      created_at: iso(86_400_000 * 5),
    },
  ];

  const profiles: Profile[] = [
    {
      id: DEMO_USER.id,
      fullname: DEMO_USER.fullname,
      email: DEMO_USER.email,
      phone: "+237 600 000 000",
      role: DEMO_USER.role,
      avatar: null,
      created_at: iso(86_400_000 * 90),
      updated_at: iso(),
    },
    {
      id: "demo-cashier-001",
      fullname: "Cashier Demo",
      email: "cashier@oneshot.cm",
      phone: null,
      role: "cashier",
      avatar: null,
      created_at: iso(86_400_000 * 80),
      updated_at: iso(),
    },
  ];

  const orderItems: OrderItem[] = [
    {
      id: "oi-1",
      order_id: "ord-1",
      product_id: "prod-1",
      quantity: 2,
      price: 3500,
      notes: null,
      station: "bar",
    },
    {
      id: "oi-2",
      order_id: "ord-1",
      product_id: "prod-8",
      quantity: 1,
      price: 12000,
      notes: "Medium rare",
      station: "grill",
    },
    {
      id: "oi-3",
      order_id: "ord-2",
      product_id: "prod-3",
      quantity: 4,
      price: 1500,
      notes: null,
      station: "bar",
    },
    {
      id: "oi-4",
      order_id: "ord-2",
      product_id: "prod-11",
      quantity: 2,
      price: 3500,
      notes: "Extra spicy",
      station: "kitchen",
    },
    {
      id: "oi-5",
      order_id: "ord-3",
      product_id: "prod-10",
      quantity: 2,
      price: 4500,
      notes: null,
      station: "kitchen",
    },
    {
      id: "oi-6",
      order_id: "ord-3",
      product_id: "prod-5",
      quantity: 2,
      price: 800,
      notes: null,
      station: "bar",
    },
    {
      id: "oi-7",
      order_id: "ord-4",
      product_id: "prod-9",
      quantity: 1,
      price: 18000,
      notes: null,
      station: "grill",
    },
    {
      id: "oi-8",
      order_id: "ord-5",
      product_id: "prod-2",
      quantity: 3,
      price: 4500,
      notes: null,
      station: "bar",
    },
  ];

  const orders: Order[] = [
    {
      id: "ord-1",
      table_number: 3,
      table_id: "table-3",
      cashier_id: DEMO_USER.id,
      status: "preparing",
      payment_method: "cash",
      subtotal: 19000,
      discount: 0,
      tax: 3657.5,
      total: 22657.5,
      notes: null,
      created_at: iso(15 * 60_000),
      updated_at: iso(10 * 60_000),
    },
    {
      id: "ord-2",
      table_number: 6,
      table_id: "table-6",
      cashier_id: "demo-cashier-001",
      status: "pending",
      payment_method: "orange_money",
      subtotal: 13000,
      discount: 0,
      tax: 2502.5,
      total: 15502.5,
      notes: "VIP guest",
      created_at: iso(8 * 60_000),
      updated_at: iso(8 * 60_000),
    },
    {
      id: "ord-3",
      table_number: 1,
      table_id: "table-1",
      cashier_id: DEMO_USER.id,
      status: "ready",
      payment_method: "mtn_momo",
      subtotal: 10600,
      discount: 500,
      tax: 1944.25,
      total: 12044.25,
      notes: null,
      created_at: iso(45 * 60_000),
      updated_at: iso(20 * 60_000),
    },
    {
      id: "ord-4",
      table_number: 4,
      table_id: "table-4",
      cashier_id: DEMO_USER.id,
      status: "completed",
      payment_method: "bank_card",
      subtotal: 18000,
      discount: 0,
      tax: 3465,
      total: 21465,
      notes: null,
      created_at: iso(86_400_000),
      updated_at: iso(86_400_000 - 30 * 60_000),
    },
    {
      id: "ord-5",
      table_number: null,
      table_id: null,
      cashier_id: "demo-cashier-001",
      status: "completed",
      payment_method: "cash",
      subtotal: 13500,
      discount: 0,
      tax: 2598.75,
      total: 16098.75,
      notes: "Takeaway",
      created_at: iso(2 * 86_400_000),
      updated_at: iso(2 * 86_400_000),
    },
  ];

  const invoices: Invoice[] = [
    {
      id: "inv-1",
      invoice_number: "INV-2026-0001",
      order_id: "ord-4",
      customer_id: "cust-1",
      subtotal: 18000,
      discount: 0,
      tax: 3465,
      total: 21465,
      payment_method: "bank_card",
      status: "paid",
      cashier_id: DEMO_USER.id,
      created_at: iso(86_400_000),
    },
    {
      id: "inv-2",
      invoice_number: "INV-2026-0002",
      order_id: "ord-5",
      customer_id: "cust-2",
      subtotal: 13500,
      discount: 0,
      tax: 2598.75,
      total: 16098.75,
      payment_method: "cash",
      status: "paid",
      cashier_id: "demo-cashier-001",
      created_at: iso(2 * 86_400_000),
    },
    {
      id: "inv-3",
      invoice_number: "INV-2026-0003",
      order_id: "ord-3",
      customer_id: null,
      subtotal: 10600,
      discount: 500,
      tax: 1944.25,
      total: 12044.25,
      payment_method: "mtn_momo",
      status: "draft",
      cashier_id: DEMO_USER.id,
      created_at: iso(45 * 60_000),
    },
  ];

  const reservations: Reservation[] = [
    {
      id: "res-1",
      customer_name: "Amina Fouda",
      phone: "+237 690 100 200",
      date: new Date(now + 86_400_000).toISOString().slice(0, 10),
      time: "19:30",
      guests: 4,
      status: "confirmed",
      table_id: "table-9",
      notes: "Birthday",
      created_at: iso(86_400_000 * 2),
    },
    {
      id: "res-2",
      customer_name: "Business Group",
      phone: "+237 690 777 888",
      date: new Date(now + 2 * 86_400_000).toISOString().slice(0, 10),
      time: "20:00",
      guests: 8,
      status: "pending",
      table_id: null,
      notes: null,
      created_at: iso(86_400_000),
    },
  ];

  const stock_movements: StockMovement[] = [
    {
      id: "sm-1",
      product_id: "prod-3",
      type: "IN",
      quantity: 48,
      reason: "Weekly restock",
      user_id: DEMO_USER.id,
      created_at: iso(3 * 86_400_000),
    },
    {
      id: "sm-2",
      product_id: "prod-12",
      type: "OUT",
      quantity: 10,
      reason: "Sale",
      user_id: DEMO_USER.id,
      created_at: iso(86_400_000),
    },
    {
      id: "sm-3",
      product_id: "prod-8",
      type: "ADJUSTMENT",
      quantity: -2,
      reason: "Spoilage check",
      user_id: DEMO_USER.id,
      created_at: iso(12 * 60_000 * 60),
    },
  ];

  const purchases: Purchase[] = [
    {
      id: "pur-1",
      supplier_id: "sup-2",
      total: 48000,
      status: "received",
      created_by: DEMO_USER.id,
      created_at: iso(5 * 86_400_000),
    },
    {
      id: "pur-2",
      supplier_id: "sup-3",
      total: 75000,
      status: "pending",
      created_by: DEMO_USER.id,
      created_at: iso(86_400_000),
    },
  ];

  const purchase_items: PurchaseItem[] = [
    {
      id: "pi-1",
      purchase_id: "pur-1",
      product_id: "prod-3",
      quantity: 48,
      price: 400,
    },
    {
      id: "pi-2",
      purchase_id: "pur-1",
      product_id: "prod-4",
      quantity: 48,
      price: 500,
    },
    {
      id: "pi-3",
      purchase_id: "pur-2",
      product_id: "prod-8",
      quantity: 20,
      price: 3500,
    },
  ];

  const notifications: Notification[] = [
    {
      id: "not-1",
      user_id: null,
      title: "Produit créé",
      message: "Mojito Classic ajouté à l'inventaire",
      type: "activity",
      read: false,
      data: { action: "create", entity: "product" },
      created_at: iso(86_400_000 * 10),
    },
    {
      id: "not-2",
      user_id: null,
      title: "Stock bas",
      message: "Loaded Nachos sous le seuil minimum",
      type: "activity",
      read: false,
      data: { action: "stock", entity: "product" },
      created_at: iso(86_400_000),
    },
    {
      id: "not-3",
      user_id: DEMO_USER.id,
      title: "Nouvelle commande",
      message: "Table 6 — commande en attente",
      type: "order",
      read: false,
      data: { order_id: "ord-2" },
      created_at: iso(8 * 60_000),
    },
  ];

  return {
    profiles,
    categories,
    products,
    suppliers,
    customers,
    restaurant_tables,
    orders,
    order_items: orderItems,
    invoices,
    reservations,
    stock_movements,
    purchases,
    purchase_items,
    notifications,
  };
}
