import type { DashboardStats } from "@/types/database";
import { DEMO_USER } from "./config";
import {
  getDemoStore,
  getTableData,
  setTableData,
  updateDemoStore,
} from "./store";

type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "in"; column: string; value: unknown[] }
  | { type: "ilike"; column: string; value: string }
  | { type: "lte"; column: string; value: unknown }
  | { type: "gte"; column: string; value: unknown }
  | { type: "or"; expression: string };

interface QueryState {
  table: string;
  filters: Filter[];
  orderBy: { column: string; ascending: boolean } | null;
  limitCount: number | null;
  wantSingle: boolean;
  selectSpec: string;
  mode: "select" | "insert" | "update" | "delete";
  insertData: Record<string, unknown> | Record<string, unknown>[] | null;
  updateData: Record<string, unknown> | null;
}

function uid() {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseOrFilter(expression: string, row: Record<string, unknown>): boolean {
  // e.g. name.ilike.%foo%,barcode.eq.foo
  const parts = expression.split(",");
  return parts.some((part) => {
    const ilike = part.match(/^(\w+)\.ilike\.%(.+)%$/i);
    if (ilike) {
      const [, col, val] = ilike;
      return String(row[col] ?? "")
        .toLowerCase()
        .includes(val.toLowerCase());
    }
    const eq = part.match(/^(\w+)\.eq\.(.+)$/i);
    if (eq) {
      const [, col, val] = eq;
      return String(row[col] ?? "") === val;
    }
    return false;
  });
}

function applyFilters(rows: Record<string, unknown>[], filters: Filter[]) {
  return rows.filter((row) =>
    filters.every((f) => {
      if (f.type === "eq") return row[f.column] === f.value;
      if (f.type === "in") return (f.value as unknown[]).includes(row[f.column]);
      if (f.type === "ilike") {
        const needle = String(f.value).replace(/%/g, "").toLowerCase();
        return String(row[f.column] ?? "")
          .toLowerCase()
          .includes(needle);
      }
      if (f.type === "lte") {
        const rv = row[f.column];
        if (typeof rv === "string") return rv <= String(f.value);
        return (rv as number) <= (f.value as number);
      }
      if (f.type === "gte") {
        const rv = row[f.column];
        if (typeof rv === "string") return rv >= String(f.value);
        return (rv as number) >= (f.value as number);
      }
      if (f.type === "or") return parseOrFilter(f.expression, row);
      return true;
    })
  );
}

/** Split select clauses on top-level commas only (respect parentheses). */
function splitSelectParts(selectSpec: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of selectSpec.replace(/\s+/g, " ").trim()) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Resolve nested selects like `*, category:categories(name, type)` */
function resolveSelect(
  rows: Record<string, unknown>[],
  selectSpec: string,
  store = getDemoStore()
): Record<string, unknown>[] {
  const specs = splitSelectParts(selectSpec);

  const relations = specs
    .map((spec) => {
      const m = spec.match(/^(\w+):(\w+)\((.*)\)$/);
      if (!m) return null;
      return { alias: m[1], table: m[2], fields: m[3].trim() };
    })
    .filter(Boolean) as { alias: string; table: string; fields: string }[];

  if (relations.length === 0) return rows;

  return rows.map((row) => {
    const next = { ...row };
    for (const rel of relations) {
      const foreignKeyGuess =
        rel.alias === "category"
          ? "category_id"
          : rel.alias === "supplier"
            ? "supplier_id"
            : rel.alias === "customer"
              ? "customer_id"
              : rel.alias === "cashier" || rel.alias === "created_by"
                ? rel.alias === "cashier"
                  ? "cashier_id"
                  : "created_by"
                : rel.alias === "product"
                  ? "product_id"
                  : rel.alias === "order"
                    ? "order_id"
                    : `${rel.alias}_id`;

      // Child collections: order_items, purchase_items
      if (rel.table === "order_items" || rel.table === "purchase_items") {
        const parentId = row.id;
        let children = getTableData(store, rel.table).filter(
          (c) => c[rel.table === "order_items" ? "order_id" : "purchase_id"] === parentId
        );
        children = resolveSelect(children, rel.fields || "*", store);
        next[rel.alias] = children;
        continue;
      }

      const fk = row[foreignKeyGuess];
      if (fk == null) {
        next[rel.alias] = null;
        continue;
      }
      const related = getTableData(store, rel.table).find((r) => r.id === fk);
      if (!related) {
        next[rel.alias] = null;
        continue;
      }
      if (rel.fields === "*" || !rel.fields) {
        next[rel.alias] = resolveSelect([related], "*", store)[0];
      } else if (rel.fields.includes(":")) {
        next[rel.alias] = resolveSelect([related], rel.fields, store)[0];
      } else {
        const fields = rel.fields.split(",").map((f) => f.trim());
        const picked: Record<string, unknown> = {};
        for (const f of fields) picked[f] = related[f];
        next[rel.alias] = picked;
      }
    }
    return next;
  });
}

function execSelect(state: QueryState) {
  const store = getDemoStore();
  let rows = [...getTableData(store, state.table)];
  rows = applyFilters(rows, state.filters);

  if (state.orderBy) {
    const { column, ascending } = state.orderBy;
    rows.sort((a, b) => {
      const av = a[column];
      const bv = b[column];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return ascending ? -1 : 1;
      return ascending ? 1 : -1;
    });
  }

  if (state.limitCount != null) rows = rows.slice(0, state.limitCount);

  rows = resolveSelect(rows, state.selectSpec, store);

  if (state.wantSingle) {
    return { data: rows[0] ?? null, error: rows[0] ? null : { message: "Not found" } };
  }
  return { data: rows, error: null };
}

function execInsert(state: QueryState) {
  const payload = state.insertData;
  if (!payload) return { data: null, error: { message: "No data" } };

  const items = Array.isArray(payload) ? payload : [payload];
  const inserted: Record<string, unknown>[] = [];

  updateDemoStore((store) => {
    const tableData = getTableData(store, state.table);
    for (const item of items) {
      const row: Record<string, unknown> = {
        id: (item.id as string) || uid(),
        created_at: (item.created_at as string) || new Date().toISOString(),
        ...item,
      };
      if (!("updated_at" in row) && state.table === "products") {
        row.updated_at = new Date().toISOString();
      }
      tableData.push(row);
      inserted.push(row);
    }
    setTableData(store, state.table, tableData);
  });

  const resolved = resolveSelect(inserted, state.selectSpec || "*");
  if (state.wantSingle || !Array.isArray(payload)) {
    return { data: resolved[0] ?? null, error: null };
  }
  return { data: resolved, error: null };
}

function execUpdate(state: QueryState) {
  let updated: Record<string, unknown>[] = [];
  updateDemoStore((store) => {
    const tableData = getTableData(store, state.table);
    const eqFilter = state.filters.find((f) => f.type === "eq");
    if (!eqFilter || !state.updateData) return;

    const idx = tableData.findIndex((row) => row[eqFilter.column] === eqFilter.value);
    if (idx === -1) return;

    tableData[idx] = {
      ...tableData[idx],
      ...state.updateData,
      updated_at: new Date().toISOString(),
    };
    updated = [tableData[idx]];
    setTableData(store, state.table, tableData);
  });

  return { data: state.wantSingle ? updated[0] ?? null : updated, error: null };
}

function execDelete(state: QueryState) {
  updateDemoStore((store) => {
    const toDelete = applyFilters(getTableData(store, state.table), state.filters);
    const deleteIds = new Set(toDelete.map((r) => r.id));
    const remaining = getTableData(store, state.table).filter((r) => !deleteIds.has(r.id));
    setTableData(store, state.table, remaining);
  });
  return { data: null, error: null };
}

class DemoQueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private state: QueryState;

  constructor(table: string) {
    this.state = {
      table,
      filters: [],
      orderBy: null,
      limitCount: null,
      wantSingle: false,
      selectSpec: "*",
      mode: "select",
      insertData: null,
      updateData: null,
    };
  }

  select(spec = "*") {
    this.state.selectSpec = spec;
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this.state.mode = "insert";
    this.state.insertData = data;
    return this;
  }

  update(data: Record<string, unknown>) {
    this.state.mode = "update";
    this.state.updateData = data;
    return this;
  }

  delete() {
    this.state.mode = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.filters.push({ type: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.state.filters.push({ type: "in", column, value });
    return this;
  }

  ilike(column: string, value: string) {
    this.state.filters.push({ type: "ilike", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.state.filters.push({ type: "lte", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.state.filters.push({ type: "gte", column, value });
    return this;
  }

  or(expression: string) {
    this.state.filters.push({ type: "or", expression });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.state.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.state.limitCount = count;
    return this;
  }

  single() {
    this.state.wantSingle = true;
    return this;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    try {
      let result: { data: unknown; error: unknown };
      if (this.state.mode === "insert") result = execInsert(this.state);
      else if (this.state.mode === "update") result = execUpdate(this.state);
      else if (this.state.mode === "delete") result = execDelete(this.state);
      else result = execSelect(this.state);
      return Promise.resolve(result).then(onfulfilled, onrejected);
    } catch (err) {
      return Promise.reject(err).then(onfulfilled, onrejected);
    }
  }
}

function getDashboardStats(): DashboardStats {
  const store = getDemoStore();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const completedLike = store.orders.filter((o) =>
    ["completed", "served", "ready", "preparing", "pending"].includes(o.status)
  );

  const today_revenue = completedLike
    .filter((o) => o.created_at.startsWith(today) && o.status === "completed")
    .reduce((s, o) => s + Number(o.total), 0);

  const monthly_revenue = completedLike
    .filter((o) => o.created_at.startsWith(month) && ["completed", "served"].includes(o.status))
    .reduce((s, o) => s + Number(o.total), 0);

  const inventory_value = store.products.reduce(
    (s, p) => s + Number(p.stock) * Number(p.purchase_price),
    0
  );

  const pending_orders = store.orders.filter((o) =>
    ["pending", "preparing", "ready"].includes(o.status)
  ).length;

  const low_stock_count = store.products.filter(
    (p) => p.status === "active" && p.stock <= p.minimum_stock
  ).length;

  return {
    today_revenue,
    monthly_revenue,
    inventory_value,
    pending_orders,
    low_stock_count,
  };
}

export function createDemoClient() {
  const authUser = {
    id: DEMO_USER.id,
    email: DEMO_USER.email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: { fullname: DEMO_USER.fullname },
    created_at: new Date().toISOString(),
  };

  return {
    from(table: string) {
      return new DemoQueryBuilder(table);
    },

    auth: {
      async getUser() {
        return { data: { user: authUser }, error: null };
      },
      async getSession() {
        return {
          data: {
            session: {
              user: authUser,
              access_token: "demo-token",
              refresh_token: "demo-refresh",
              expires_in: 3600,
              token_type: "bearer",
            },
          },
          error: null,
        };
      },
      async signInWithPassword() {
        return { data: { user: authUser, session: null }, error: null };
      },
      async signUp() {
        return { data: { user: authUser, session: null }, error: null };
      },
      async signOut() {
        return { error: null };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
    },

    async rpc(fn: string) {
      if (fn === "get_dashboard_stats") {
        return { data: getDashboardStats(), error: null };
      }
      if (fn === "generate_invoice_number") {
        const n = getDemoStore().invoices.length + 1;
        return { data: `INV-2026-${String(n).padStart(4, "0")}`, error: null };
      }
      return { data: null, error: { message: `Unknown RPC: ${fn}` } };
    },

    channel() {
      return {
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
        unsubscribe() {
          return this;
        },
      };
    },

    removeChannel() {
      /* no-op */
    },

    storage: {
      from() {
        return {
          async upload() {
            return { data: { path: "demo" }, error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `data:image/svg+xml,demo-${encodeURIComponent(path)}` } };
          },
        };
      },
    },
  };
}

export type DemoClient = ReturnType<typeof createDemoClient>;
