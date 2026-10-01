import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { authMode } from "@/lib/auth";
import { logout } from "./login/actions";

export const metadata: Metadata = {
  title: "CFB Prospect Report",
  description: "Dynasty rookie prospect reports for college QBs, RBs, WRs and TEs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const showLogout = authMode() === "on";
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center gap-x-5 gap-y-1 overflow-x-auto px-4 py-3 text-sm whitespace-nowrap">
            <Link href="/" className="font-bold tracking-tight">
              🏈 CFB Prospect Report
            </Link>
            <Link href="/" className="text-muted hover:text-foreground">Search</Link>
            <Link href="/boards" className="text-muted hover:text-foreground">Boards</Link>
            <Link href="/imports" className="text-muted hover:text-foreground">Imports</Link>
            {showLogout && (
              <form action={logout} className="ml-auto">
                <button className="text-muted hover:text-foreground">Sign out</button>
              </form>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
