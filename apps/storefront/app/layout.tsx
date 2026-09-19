import type { Metadata, Viewport } from "next";
import { Albert_Sans, Fraunces } from "next/font/google";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CopyCode } from "@/components/site/CopyCode";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { MobileMenu } from "@/components/site/MobileMenu";
import { Providers } from "@/components/site/Providers";
import { SearchCommand } from "@/components/site/SearchCommand";
import { Toaster } from "@/components/ui/sonner";
import { heroImages } from "@/lib/hero";
import { plateMap } from "@/lib/plates";
import { catalogImages } from "@/lib/product";
import { cachedCatalog, renderPerRequestIfBuilding } from "@/server/render-cache";
import "./globals.css";

const albert = Albert_Sans({
  subsets: ["latin"],
  variable: "--font-albert",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Variable Fraunces with its soft and optical-size axes: rounded serifs for every heading.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Meridian: furniture for everyday rooms", template: "%s · Meridian" },
  description:
    "Sofas, tables, lighting and storage in wool, oak and walnut. A demo furniture store with a real, sandboxed checkout.",
};

// Nothing here reads the request (session, cart and stock load in the browser), so pages without request data are
// static. The catalog snapshot below is cached data: every static page is refreshed at most every 60 s, and admin
// catalog writes revalidate the whole tree on demand (server/render-cache.ts).
export const revalidate = 60;

export const viewport: Viewport = {
  themeColor: "#faf7f2",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The shell renders even when catalog-service is down and no snapshot was ever loaded; pages show their own states.
  // During `next build` an unavailable catalog makes routes render per request rather than baking an empty shell.
  const catalog = await cachedCatalog().catch(async () => {
    await renderPerRequestIfBuilding();
    return null;
  });
  const plates = await plateMap([...(catalog ? catalogImages(catalog) : []), ...Object.values(heroImages())]);
  return (
    <html lang="en" className={`${albert.variable} ${fraunces.variable}`}>
      <body>
        <Providers plates={plates} catalog={catalog}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
          >
            Skip to content
          </a>
          <div className="bg-ink text-paper">
            <p className="shell flex h-9 items-center justify-center gap-1 text-center text-[0.8125rem]">
              <span className="sm:hidden">Demo store · Sandbox checkout ·</span>
              <span className="hidden sm:inline">This is a demo store. Checkout runs in a sandbox and nothing ships. Use code</span>
              <CopyCode code="NORTH-10" />
              <span className="hidden sm:inline">for 10% off.</span>
            </p>
          </div>
          <Header />
          <div id="main">{children}</div>
          <Footer categories={catalog?.categories ?? []} />
          <CartDrawer />
          <MobileMenu />
          <SearchCommand />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
