"use client";

import Image from "next/image";
import { usePlate } from "./PlateProvider";

const WELL = 4 / 5;

/**
 * One photo inside a plaster well of any ratio. When the photo's ratio differs from the well,
 * the photo keeps its full frame and the gap is filled with its own sampled wall and floor
 * colours, feathered into the photo, so every tile reads as one studio shot.
 */
export function Plate({
  src,
  alt,
  sizes,
  ratio = WELL,
  priority,
  className = "",
  hidden,
}: {
  src: string;
  alt: string;
  sizes: string;
  ratio?: number;
  priority?: boolean;
  className?: string;
  hidden?: boolean;
}) {
  const plate = usePlate(src);
  const photo = plate ? plate.w / plate.h : undefined;
  const fits = !photo || Math.abs(photo - ratio) / ratio < 0.12;
  const wide = photo !== undefined && photo > ratio;

  return (
    <div className={`absolute inset-0 ${className}`} style={{ opacity: hidden ? 0 : 1 }} aria-hidden={hidden || undefined}>
      {!fits && plate ? (
        wide ? (
          <>
            <div className="well-band" data-edge="top" style={{ background: `linear-gradient(to right, ${plate.top.join(", ")})` }} />
            <div className="well-band" data-edge="bottom" style={{ background: `linear-gradient(to right, ${plate.bottom.join(", ")})` }} />
          </>
        ) : (
          <>
            <div className="well-band" data-edge="left" style={{ background: `linear-gradient(to bottom, ${plate.left.join(", ")})` }} />
            <div className="well-band" data-edge="right" style={{ background: `linear-gradient(to bottom, ${plate.right.join(", ")})` }} />
          </>
        )
      ) : null}
      <div
        className={fits ? "absolute inset-0" : `absolute ${wide ? "inset-x-0 top-1/2 -translate-y-1/2" : "inset-y-0 left-1/2 -translate-x-1/2"}`}
        style={fits ? undefined : wide ? { aspectRatio: String(photo) } : { aspectRatio: String(photo), height: "100%" }}
      >
        <Image
          src={src}
          alt={hidden ? "" : alt}
          fill
          sizes={sizes}
          priority={priority}
          className={`object-cover ${fits ? "" : wide ? "plate-wide" : "plate-tall"}`}
        />
      </div>
    </div>
  );
}
