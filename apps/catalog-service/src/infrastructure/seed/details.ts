import type { ProductDetailsProps } from "../../domain/product/product-details";

type Details = { width: number; depth: number; height: number; weightKg: number; care: string; construction: string };

/** Ported verbatim from apps/storefront/lib/details.ts. */
const table: Record<string, Details> = {
  "holt-sofa": { width: 240, depth: 92, height: 78, weightKg: 68, care: "Vacuum the wool on low. Wipe walnut with a dry cloth.", construction: "Kiln-dried beech frame on sinuous springs. Seat cushions in high-resilience foam wrapped in fibre, with removable wool covers. Turned walnut legs." },
  "nara-sofa": { width: 168, depth: 86, height: 72, weightKg: 41, care: "Feed the saddle hide twice a year. Never soak.", construction: "Welded steel frame, powder-coated black. Seat and back cushions in saddle leather over foam, stitched in place." },
  "pil-lounge": { width: 82, depth: 90, height: 74, weightKg: 22, care: "Wipe the hide dry. Oil the oak once a year.", construction: "Solid oak frame with finger joints. A camel leather sling over a foam pad; the leather darkens with use." },
  "soren-sofa": { width: 228, depth: 90, height: 76, weightKg: 64, care: "Vacuum the linen. Wipe walnut with a dry cloth.", construction: "Beech frame with webbing suspension. Foam and fibre cushions in removable linen covers. Walnut legs set back from the arms." },
  "vale-lounge": { width: 86, depth: 88, height: 74, weightKg: 24, care: "Brush the velvet with the pile. Oil the oak once a year.", construction: "Plywood and beech frame, fully upholstered in cotton velvet. Stained black oak legs with felt glides." },
  "wren-lounge": { width: 78, depth: 86, height: 70, weightKg: 18, care: "Vacuum the wool. Wipe oak with a dry cloth.", construction: "Moulded foam shell on a steel inner frame, upholstered in wool. Solid oak legs." },
  "sola-chair": { width: 72, depth: 80, height: 74, weightKg: 10, care: "Dust the cane. Vacuum the linen cushion.", construction: "Bent rattan frame with a woven cane seat and back. Loose oatmeal linen cushion over a foam pad." },
  "mar-daybed": { width: 200, depth: 90, height: 72, weightKg: 46, care: "Vacuum the boucle. Wipe ash with a dry cloth.", construction: "Ash frame with a slatted base. Boucle-covered foam mattress and one loose bolster." },
  "reed-chair": { width: 48, depth: 52, height: 80, weightKg: 7, care: "Wipe the hide dry. Oil the oak once a year.", construction: "Solid oak frame with mortise-and-tenon joints. Seat and back pads in leather over foam." },
  "ren-chair": { width: 48, depth: 50, height: 78, weightKg: 6, care: "Wipe the oak with a dry cloth. Dust the paper cord.", construction: "Solid oak frame with a curved back rail. Seat woven from paper cord in a herringbone pattern." },
  "pico-stool": { width: 36, depth: 36, height: 42, weightKg: 5, care: "Wipe the paint with a damp cloth.", construction: "Turned solid beech seat on three splayed legs, finished in a water-based paint." },
  "bruk-stool": { width: 35, depth: 35, height: 45, weightKg: 4, care: "Wipe the cork with a dry cloth. Keep it dry.", construction: "A single block of natural cork with a slightly concave seat and rounded edges." },
  "feld-table": { width: 220, depth: 95, height: 75, weightKg: 54, care: "Oil the top each season. No standing water.", construction: "Solid top, 40 mm thick, on four square legs with steel corner brackets. Hard-wax oil finish." },
  "dune-table": { width: 140, depth: 140, height: 75, weightKg: 48, care: "Wipe with a dry cloth. Use mats under hot dishes.", construction: "Round top in oak veneer with a solid oak edge, on four solid oak legs. Matt lacquer." },
  "desk-lin": { width: 140, depth: 65, height: 74, weightKg: 28, care: "Wipe walnut with a dry cloth. Let the brass pull tarnish.", construction: "Solid walnut top and legs. One dovetailed drawer on wooden runners, with a solid brass pull." },
  "tor-console": { width: 160, depth: 42, height: 80, weightKg: 34, care: "Wipe the paint with a damp cloth. Let the brass tarnish.", construction: "Painted MDF carcass on solid oak legs. Two drawers on soft-close runners, brass pulls." },
  "ash-table": { width: 110, depth: 60, height: 38, weightKg: 22, care: "Wipe with a dry cloth. No standing water.", construction: "Solid ash top and legs, whitewashed and sealed with a matt water-based lacquer." },
  "terra-table": { width: 45, depth: 45, height: 50, weightKg: 18, care: "Wipe with a dry cloth. No standing water.", construction: "Carved from a single piece of honed stone: a thick round top on a wide cylindrical base." },
  "loma-table": { width: 110, depth: 60, height: 35, weightKg: 32, care: "Wipe with a dry cloth. Use mats under hot dishes.", construction: "Polished terrazzo throughout. A thick top on two solid terrazzo slab legs." },
  "lamp-arc": { width: 40, depth: 160, height: 190, weightKg: 11, care: "Dust the linen shade. Wipe the stem dry.", construction: "Steel arc on a weighted base. Hand-stitched linen drum shade. E27 bulb and a dimmer on the cord." },
  "kite-lamp": { width: 42, depth: 42, height: 158, weightKg: 8, care: "Dust the linen shade. Wipe the stem dry.", construction: "Powder-coated steel stem and base. Pleated linen shade. E27 bulb and a foot switch." },
  "halo-lamp": { width: 28, depth: 28, height: 46, weightKg: 3, care: "Wipe the ceramic with a damp cloth. Dust the shade.", construction: "Hand-glazed ceramic base and a white linen shade. E27 bulb, in-line switch on a fabric cord." },
  "pebble-lamp": { width: 28, depth: 28, height: 44, weightKg: 3, care: "Wipe the stoneware with a damp cloth. Dust the shade.", construction: "Matt speckled stoneware pebble base and a pleated linen shade. E27 bulb, in-line switch on a fabric cord." },
  "pendant-coil": { width: 32, depth: 32, height: 48, weightKg: 3, care: "Dust only. Blackened brass darkens with time.", construction: "Spun brass shade, blackened and lacquered. Two metres of black fabric cord and a ceiling rose." },
  "wick-pendant": { width: 30, depth: 30, height: 32, weightKg: 2, care: "Dust the glass. Clean with a soft dry cloth.", construction: "Mouth-blown glass globe with a brushed brass cap. Two metres of fabric cord." },
  "nook-cabinet": { width: 100, depth: 46, height: 160, weightKg: 58, care: "Wipe the paint with a damp cloth. Let the brass tarnish.", construction: "Painted MDF carcass on a solid plinth. Two doors on soft-close hinges, three adjustable shelves, brass pulls." },
  "cist-shelf": { width: 90, depth: 32, height: 180, weightKg: 36, care: "Wipe the paint with a damp cloth. Fix to the wall.", construction: "Painted solid pine frame with five fixed shelves and an open back. Wall fixings included." },
  "drift-bench": { width: 140, depth: 42, height: 46, weightKg: 16, care: "Vacuum the wool. Wipe walnut with a dry cloth.", construction: "Beech frame with a foam seat upholstered in wool. Solid walnut legs." },
  "sideboard-kiln": { width: 200, depth: 48, height: 78, weightKg: 62, care: "Wipe smoked oak with a dry cloth.", construction: "Smoked oak veneer carcass with solid oak edges. Two sliding doors over adjustable shelves." },
};

export function seedDetails(slug: string): ProductDetailsProps {
  const d = table[slug];
  if (!d) throw new Error(`seed: no details for ${slug}`);
  return { widthCm: d.width, depthCm: d.depth, heightCm: d.height, weightKg: d.weightKg, construction: d.construction, care: d.care };
}
