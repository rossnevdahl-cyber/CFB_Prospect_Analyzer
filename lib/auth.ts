export const SESSION_COOKIE = "cfb_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/** Session token = SHA-256 of the password with a fixed app salt. Changing APP_PASSWORD logs everyone out. */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`cfb-prospect-report:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** With no APP_PASSWORD, auth is off in development and everything is locked in production. */
export function authMode(): "off" | "on" | "locked" {
  if (process.env.APP_PASSWORD) return "on";
  return process.env.NODE_ENV === "production" ? "locked" : "off";
}
