"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Tracks whether a horizontal scroller has hidden content before or after its visible edge. */
function useScrollEdges() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  return { ref, edges };
}

/** Wide tables scroll inside their frame; a soft shade on the clipped side says there is more to see. `compact` tightens cell gutters for tablet widths. */
function Table({ className, compact, ...props }: React.ComponentProps<"table"> & { compact?: boolean }) {
  const { ref, edges } = useScrollEdges();
  return (
    <div data-slot="table-container" className="relative overflow-hidden rounded-[16px] border border-line">
      <div ref={ref} className="overflow-x-auto">
        <table data-slot="table" className={cn("w-full text-left text-[0.9375rem]", compact && "[&_td]:px-3 [&_th]:px-3 xl:[&_td]:px-4 xl:[&_th]:px-4", className)} {...props} />
      </div>
      <span aria-hidden="true" className={cn("pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-ink/10 to-transparent transition-opacity", edges.start ? "opacity-100" : "opacity-0")} />
      <span aria-hidden="true" className={cn("pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-ink/10 to-transparent transition-opacity", edges.end ? "opacity-100" : "opacity-0")} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("bg-plaster text-sm text-stone", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("divide-y divide-line", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("transition-colors data-[state=selected]:bg-plaster", className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th data-slot="table-head" className={cn("px-4 py-3 font-medium whitespace-nowrap", className)} {...props} />;
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-3 text-sm text-stone", className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, useScrollEdges };
