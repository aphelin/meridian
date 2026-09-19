#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$ROOT/apps/storefront/public"
mkdir -p "$PUB/products" "$PUB/materials" "$PUB/states" "$PUB/hero" "$PUB/brand"

plate() {
  local out="$1"
  local w="$2"
  local h="$3"
  local wall="$4"
  shift 4
  magick -size "${w}x${h}" "xc:${wall}" -fill none -stroke "#16140f" -strokewidth 6 -stroke-linecap butt -stroke-linejoin miter \
    "$@" -quality 88 "$out"
}

grain() {
  magick "$1" \( -size 200x200 xc: +noise Random -colorspace gray -blur 0x0.6 -resize "${2}x${3}!" -evaluate multiply 0.06 \) \
    -compose overlay -composite "$1"
}

plate "$PUB/products/holt-sofa-hero.jpg" 1600 2000 "#e6e1d6" \
  -draw "stroke-linejoin round path 'M 220,1280 L 220,1080 L 380,980 L 1220,980 L 1380,1080 L 1380,1280 Z'" \
  -draw "path 'M 260,1280 L 260,1420'" \
  -draw "path 'M 1340,1280 L 1340,1420'" \
  -draw "path 'M 220,1280 L 1380,1280'" \
  -draw "path 'M 380,980 L 380,1280'" \
  -draw "path 'M 800,980 L 800,1280'" \
  -draw "path 'M 1220,980 L 1220,1280'"
grain "$PUB/products/holt-sofa-hero.jpg" 1600 2000

magick "$PUB/products/holt-sofa-hero.jpg" -crop 1600x900+0+900 +repage -resize 1600x1200! \
  -quality 88 "$PUB/products/holt-sofa-detail.jpg"

plate "$PUB/products/nara-sofa-hero.jpg" 1600 2000 "#ddd6cc" \
  -draw "stroke-linejoin round path 'M 360,1200 L 360,1080 C 360,1000 500,940 800,940 C 1100,940 1240,1000 1240,1080 L 1240,1200 Z'" \
  -draw "path 'M 420,1200 L 420,1380'" \
  -draw "path 'M 1180,1200 L 1180,1380'" \
  -draw "path 'M 360,1200 L 1240,1200'"
grain "$PUB/products/nara-sofa-hero.jpg" 1600 2000
magick "$PUB/products/nara-sofa-hero.jpg" -crop 1600x900+0+850 +repage -resize 1600x1200! -quality 88 "$PUB/products/nara-sofa-detail.jpg"

plate "$PUB/products/pil-lounge-hero.jpg" 1600 2000 "#e3d8c8" \
  -draw "stroke-linejoin round path 'M 520,900 C 520,780 700,720 860,780 C 1000,830 1080,960 1040,1120 L 700,1240 C 560,1160 520,1020 520,900 Z'" \
  -draw "path 'M 700,1240 L 640,1480'" \
  -draw "path 'M 980,1180 L 1100,1480'" \
  -draw "path 'M 640,1480 L 1100,1480'"
grain "$PUB/products/pil-lounge-hero.jpg" 1600 2000
magick "$PUB/products/pil-lounge-hero.jpg" -crop 1600x900+0+700 +repage -resize 1600x1200! -quality 88 "$PUB/products/pil-lounge-detail.jpg"

plate "$PUB/products/feld-table-hero.jpg" 1600 2000 "#e8e0d2" \
  -draw "stroke-linejoin round path 'M 180,980 L 1420,980 L 1360,1060 L 240,1060 Z'" \
  -draw "path 'M 800,1060 L 800,1500'" \
  -draw "ellipse 800,1500 180,28 0,360"
grain "$PUB/products/feld-table-hero.jpg" 1600 2000
magick "$PUB/products/feld-table-hero.jpg" -crop 1600x800+0+700 +repage -resize 1600x1200! -quality 88 "$PUB/products/feld-table-detail.jpg"

plate "$PUB/products/desk-lin-hero.jpg" 1600 2000 "#e2d6c4" \
  -draw "stroke-linejoin round path 'M 240,1080 L 1360,1080 L 1320,1160 L 280,1160 Z'" \
  -draw "path 'M 360,1160 L 360,1480'" \
  -draw "path 'M 1240,1160 L 1240,1480'" \
  -draw "rectangle 980,1100 1280,1160"
grain "$PUB/products/desk-lin-hero.jpg" 1600 2000
magick "$PUB/products/desk-lin-hero.jpg" -crop 1600x800+0+850 +repage -resize 1600x1200! -quality 88 "$PUB/products/desk-lin-detail.jpg"

plate "$PUB/products/lamp-arc-hero.jpg" 1600 2000 "#ece7de" \
  -draw "stroke-linejoin round path 'M 420,1680 C 420,900 980,420 1280,520'" \
  -draw "ellipse 1280,560 90,54 0,360" \
  -draw "ellipse 420,1680 70,18 0,360"
grain "$PUB/products/lamp-arc-hero.jpg" 1600 2000
magick "$PUB/products/lamp-arc-hero.jpg" -crop 900x900+900+200 +repage -resize 1600x1200! -quality 88 "$PUB/products/lamp-arc-detail.jpg"

plate "$PUB/products/pendant-coil-hero.jpg" 1600 2000 "#f0ebe3" \
  -draw "path 'M 800,120 L 800,520'" \
  -draw "stroke-linejoin round path 'M 560,520 C 560,820 1040,820 1040,520 Z'"
grain "$PUB/products/pendant-coil-hero.jpg" 1600 2000
magick "$PUB/products/pendant-coil-hero.jpg" -crop 900x900+350+350 +repage -resize 1600x1200! -quality 88 "$PUB/products/pendant-coil-detail.jpg"

plate "$PUB/products/sideboard-kiln-hero.jpg" 1600 2000 "#d8d0c4" \
  -draw "stroke-linejoin round rectangle 180,980 1420,1380" \
  -draw "path 'M 800,980 L 800,1380'" \
  -draw "path 'M 280,1480 L 280,1380'" \
  -draw "path 'M 1320,1480 L 1320,1380'"
grain "$PUB/products/sideboard-kiln-hero.jpg" 1600 2000
magick "$PUB/products/sideboard-kiln-hero.jpg" -crop 1600x700+0+900 +repage -resize 1600x1200! -quality 88 "$PUB/products/sideboard-kiln-detail.jpg"

for pair in "wool-oatmeal:#d9cbb3" "wool-charcoal:#3f3c39" "leather-saddle:#8a5a32" "leather-camel:#c4894a" "oak:#c4a06a" "walnut:#6b4226" "black-steel:#1c1c1c" "brass:#c4a15a"; do
  name="${pair%%:*}"
  hex="${pair##*:}"
  magick -size 512x512 "xc:${hex}" -fill none -stroke "#16140f" -strokewidth 2 -draw "rectangle 8,8 504,504" -quality 88 "$PUB/materials/${name}.jpg"
done

magick "$PUB/products/sideboard-kiln-hero.jpg" -modulate 78,90,100 -quality 88 "$PUB/states/sold-out.jpg"
magick -size 2400x1600 xc:"#efece6" -fill none -stroke "#16140f" -strokewidth 3 \
  -draw "path 'M 200,200 L 2200,200 L 2200,1400 L 200,1400 Z'" \
  -draw "path 'M 200,200 L 400,80 L 2400,80 L 2200,200'" \
  -quality 88 "$PUB/states/cart-empty.jpg"
magick -size 2400x1600 xc:"#efece6" -fill none -stroke "#16140f" -strokewidth 6 \
  -draw "stroke-linejoin round path 'M 400,1100 L 400,900 L 620,800 L 1780,800 L 2000,900 L 2000,1100 Z'" \
  -draw "path 'M 460,1100 L 460,1280'" \
  -draw "path 'M 1940,1100 L 1940,1280'" \
  -quality 86 "$PUB/hero/room-01.jpg"
cp "$PUB/products/feld-table-hero.jpg" "$PUB/hero/room-02.jpg"

echo plates_ok
