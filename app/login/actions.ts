"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeEqual, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";

export async function login(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return { error: "APP_PASSWORD is not configured on the server." };
  const given = String(form.get("password") ?? "");
  if (!safeEqual(await sessionToken(given), await sessionToken(expected))) return { error: "Wrong password." };
  (await cookies()).set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
