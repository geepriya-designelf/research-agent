import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Insights",
  description:
    "Turn interview transcripts and UX sessions into traceable research knowledge — evidence, synthesis, themes, and UX findings that stay linked to their source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">Research Insights</span>
            </Link>
            <p className="hidden text-xs text-muted-ink sm:block">
              Source → Evidence → Synthesis → Theme → UX Finding → Recommendation
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
