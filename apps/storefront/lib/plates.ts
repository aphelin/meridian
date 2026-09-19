import { existsSync } from "node:fs";
import path from "node:path";
import sharp, { type Region } from "sharp";

/** Pixel size plus the photo's own edge colours (three samples along each edge), used to extend a plate into a well. */
export type PlateInfo = { w: number; h: number; top: string[]; bottom: string[]; left: string[]; right: string[] };
export type PlateMap = Record<string, PlateInfo>;

const publicDir = path.join(process.cwd(), "public");
const cache = new Map<string, Promise<PlateInfo | null>>();

const hex = (buf: Buffer, i: number) =>
  `#${[buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

async function edge(file: string, region: Region, cols: number, rows: number) {
  const buf = await sharp(file).extract(region).resize(cols, rows, { fit: "fill" }).removeAlpha().raw().toBuffer();
  return Array.from({ length: cols * rows }, (_, i) => hex(buf, i));
}

/** Only files under /public are inspected; the resolved path must stay inside it. */
function localFile(src: string): string | null {
  if (!src.startsWith("/") || src.startsWith("//")) return null;
  const file = path.join(publicDir, src);
  return file.startsWith(publicDir + path.sep) ? file : null;
}

async function inspect(src: string): Promise<PlateInfo | null> {
  const file = localFile(src);
  if (!file || !existsSync(file)) return null;
  try {
    const { width: w, height: h } = await sharp(file).metadata();
    if (!w || !h) return null;
    const strip = Math.max(2, Math.round(Math.min(w, h) * 0.025));
    const [top, bottom, left, right] = await Promise.all([
      edge(file, { left: 0, top: 0, width: w, height: strip }, 3, 1),
      edge(file, { left: 0, top: h - strip, width: w, height: strip }, 3, 1),
      edge(file, { left: 0, top: 0, width: strip, height: h }, 1, 3),
      edge(file, { left: w - strip, top: 0, width: strip, height: h }, 1, 3),
    ]);
    return { w, h, top, bottom, left, right };
  } catch {
    return null;
  }
}

export function hasPublicFile(src: string) {
  const file = localFile(src);
  return Boolean(file && existsSync(file));
}

export function assetOr(preferred: string, fallback: string) {
  return hasPublicFile(preferred) ? preferred : fallback;
}

export async function plateMap(sources: string[]): Promise<PlateMap> {
  const unique = [...new Set(sources)].slice(0, 500);
  const entries = await Promise.all(
    unique.map(async (src) => {
      if (!cache.has(src)) cache.set(src, inspect(src));
      return [src, await cache.get(src)!] as const;
    }),
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, PlateInfo] => e[1] !== null));
}
