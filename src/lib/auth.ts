/**
 * Supabase refuses passwords shorter than 6 characters and its dashboard cannot
 * be set lower, so short PINs are padded with a fixed suffix before they reach
 * Auth. Staff type 4 digits; Supabase stores a long-enough password.
 * Passwords of 6 characters or more are sent untouched, so accounts created
 * before this existed keep working.
 */
const PIN_SUFFIX = "@OneShot1";

export const MIN_PASSWORD_LENGTH = 4;

export function toAuthPassword(input: string): string {
  return input.length >= 6 ? input : input + PIN_SUFFIX;
}

/** Supabase errors sometimes arrive as bare objects, which render as "{}". */
export function authErrorMessage(error: unknown, fallback = "Une erreur est survenue"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error || fallback;

  if (typeof error === "object") {
    const source = error as Record<string, unknown>;
    for (const key of ["message", "msg", "error_description", "error", "details", "hint"]) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }

  return fallback;
}
