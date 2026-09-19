import type { Metadata } from "next";

/** Public origin for canonical links, OpenGraph, JSON-LD and the sitemap (PUBLIC_SITE_URL, else the dev storefront). */
export function siteUrl(): string {
  const raw = process.env.PUBLIC_SITE_URL?.trim() || "http://localhost:3100";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "http://localhost:3100";
  }
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Canonical + OpenGraph + Twitter card for an indexable page. */
export function pageMetadata({ title, description, path, image, type = "website" }: { title: string; description: string; path: string; image?: string; type?: "website" | "article" }): Metadata {
  const url = absoluteUrl(path);
  const images = image ? [{ url: absoluteUrl(image), alt: title }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · Meridian`, description, url, siteName: "Meridian", type, locale: "en_IE", images },
    twitter: { card: image ? "summary_large_image" : "summary", title: `${title} · Meridian`, description, images: images?.map((i) => i.url) },
  };
}

/** JSON-LD script body: `<` is escaped so catalog text can never close the script element. */
export function jsonLdHtml(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
