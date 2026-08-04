import type { CartItem } from "@/types/database";

export const POS_TICKETS_KEY = "oneshot-pos-open-tickets";

export interface PosTicket {
  id: string;
  label: string;
  tableNumber: number | null;
  tableId: string | null;
  cart: CartItem[];
  discount: number;
}

export function newTicketId() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createEmptyTicket(index = 1): PosTicket {
  return {
    id: newTicketId(),
    label: `F${index}`,
    tableNumber: null,
    tableId: null,
    cart: [],
    discount: 0,
  };
}

export function ticketLabel(ticket: Pick<PosTicket, "tableNumber" | "label">) {
  return ticket.tableNumber != null ? `T${ticket.tableNumber}` : ticket.label;
}

export function loadPosTickets(): { tickets: PosTicket[]; activeId: string } {
  if (typeof window === "undefined") {
    const ticket = createEmptyTicket(1);
    return { tickets: [ticket], activeId: ticket.id };
  }
  try {
    const raw = localStorage.getItem(POS_TICKETS_KEY);
    if (!raw) {
      const ticket = createEmptyTicket(1);
      return { tickets: [ticket], activeId: ticket.id };
    }
    const parsed = JSON.parse(raw) as { tickets?: PosTicket[]; activeId?: string };
    const tickets = Array.isArray(parsed.tickets) && parsed.tickets.length > 0
      ? parsed.tickets
      : [createEmptyTicket(1)];
    const activeId =
      tickets.find((t) => t.id === parsed.activeId)?.id ?? tickets[0].id;
    return { tickets, activeId };
  } catch {
    const ticket = createEmptyTicket(1);
    return { tickets: [ticket], activeId: ticket.id };
  }
}

export function savePosTickets(tickets: PosTicket[], activeId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POS_TICKETS_KEY, JSON.stringify({ tickets, activeId }));
  } catch {
    /* ignore quota */
  }
}
