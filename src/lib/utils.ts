import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "XAF"): string {
  return new Intl.NumberFormat("fr-CM", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const random = Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, "0");
  return `OS${year}${random}`;
}

export function calculateTax(subtotal: number, rate = 19.25): number {
  return Math.round(subtotal * (rate / 100));
}

export function calculateTotal(
  subtotal: number,
  discount = 0,
  taxRate = 19.25
): { subtotal: number; discount: number; tax: number; total: number } {
  const afterDiscount = subtotal - discount;
  const tax = calculateTax(afterDiscount, taxRate);
  return {
    subtotal,
    discount,
    tax,
    total: afterDiscount + tax,
  };
}
