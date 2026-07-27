import { createInitialStore, type DemoStore } from "./seed";

const STORAGE_KEY = "oneshot-demo-store-v1";

type TableName = keyof DemoStore;

let memoryStore: DemoStore | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function cloneStore(store: DemoStore): DemoStore {
  return JSON.parse(JSON.stringify(store)) as DemoStore;
}

export function getDemoStore(): DemoStore {
  if (memoryStore) return memoryStore;

  if (isBrowser()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoStore;
        if (parsed?.products && parsed?.categories) {
          memoryStore = parsed;
          return memoryStore;
        }
      }
    } catch {
      /* reset on corrupt storage */
    }
  }

  memoryStore = createInitialStore();
  persistDemoStore();
  return memoryStore;
}

export function persistDemoStore() {
  if (!memoryStore || !isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryStore));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function updateDemoStore(mutator: (store: DemoStore) => void) {
  const store = getDemoStore();
  mutator(store);
  persistDemoStore();
}

export function resetDemoStore() {
  memoryStore = createInitialStore();
  persistDemoStore();
  return memoryStore;
}

export function getTableData(store: DemoStore, table: string): Record<string, unknown>[] {
  const key = table as TableName;
  const data = store[key];
  if (!Array.isArray(data)) return [];
  return data as unknown as Record<string, unknown>[];
}

export function setTableData(
  store: DemoStore,
  table: string,
  rows: Record<string, unknown>[]
) {
  const key = table as TableName;
  (store as unknown as Record<string, unknown>)[key] = rows;
}

export { cloneStore };
export type { TableName };
