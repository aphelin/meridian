"use client";

import { useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { Plate } from "../ui/Plate";

export function Gallery({ name, images, index, onIndex }: { name: string; images: string[]; index: number; onIndex: (i: number) => void }) {
  const [mounted, setMounted] = useState<number[]>([index]);
  const touch = useRef<number | null>(null);
  const count = images.length;

  const go = (i: number) => {
    const next = (i + count) % count;
    setMounted((m) => (m.includes(next) ? m : [...m, next]));
    onIndex(next);
  };

  if (!mounted.includes(index)) setMounted((m) => [...m, index]);

  return (
    <div>
      <div
        className="well mx-auto aspect-[4/5] max-h-[60svh] lg:max-h-[calc(100svh-9rem)]"
        onTouchStart={(e) => {
          touch.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = (e.changedTouches[0]?.clientX ?? touch.current) - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        }}
      >
        {images.map((src, i) =>
          mounted.includes(i) ? (
            <Plate
              key={src}
              src={src}
              alt={`${name}, photo ${i + 1} of ${count}`}
              sizes="(min-width: 1024px) 56vw, 100vw"
              priority={i === 0}
              hidden={i !== index}
              className="plate"
            />
          ) : null,
        )}
        {count > 1 ? (
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button type="button" className="grid size-11 place-items-center rounded-full bg-paper/90 transition hover:bg-paper" onClick={() => go(index - 1)} aria-label="Previous photo">
              <Icon name="arrowLeft" size={18} />
            </button>
            <button type="button" className="grid size-11 place-items-center rounded-full bg-paper/90 transition hover:bg-paper" onClick={() => go(index + 1)} aria-label="Next photo">
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
        ) : null}
        <p className="absolute bottom-5 left-5 rounded-full bg-paper/90 px-2.5 py-1 text-xs tabular" aria-live="polite">
          {index + 1} / {count}
        </p>
      </div>
      {count > 1 ? (
        <div className="no-scrollbar -m-1 mt-2 flex justify-center-safe gap-2.5 overflow-x-auto p-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              className={`well aspect-[4/5] w-[72px] shrink-0 !rounded-[12px] ring-offset-2 transition-shadow sm:w-20 ${
                i === index ? "ring-2 ring-cobalt" : "opacity-80 hover:opacity-100"
              }`}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              onClick={() => go(i)}
            >
              <Plate src={src} alt="" sizes="80px" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
