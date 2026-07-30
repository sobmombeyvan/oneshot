/** Client tablet session: table number chosen at login */

const TABLET_KEY = "oneshot_tablet";

export interface TabletSession {
  tableNumber: number;
  startedAt: string;
}

export function getTabletSession(): TabletSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TABLET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TabletSession;
    if (!parsed?.tableNumber || parsed.tableNumber < 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setTabletSession(tableNumber: number): void {
  if (typeof window === "undefined") return;
  const session: TabletSession = {
    tableNumber,
    startedAt: new Date().toISOString(),
  };
  localStorage.setItem(TABLET_KEY, JSON.stringify(session));
}

export function clearTabletSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TABLET_KEY);
}
