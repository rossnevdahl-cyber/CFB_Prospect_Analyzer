import { NextResponse, type NextRequest } from "next/server";
import { authMode, safeEqual, SESSION_COOKIE, sessionToken } from "./lib/auth";

/** Single-user password gate: every page and API route needs the session cookie. */
export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "off") return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (mode === "on") {
    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (cookie && safeEqual(cookie, await sessionToken(process.env.APP_PASSWORD as string))) return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
