"use client";

import { useState, type ReactNode } from "react";
import type { ColorFamily, FacetValueDto, MaterialDto, SearchResultDto, SearchSort } from "@meridian/contracts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useCatalog } from "@/lib/catalog-context";
import { colourLabel, money } from "@/lib/format";
import { Icon } from "../ui/Icon";
import {
  centsToPosition,
  clearedFilters,
  positionToCents,
  priceBounds,
  SLIDER_STEPS,
  SORTS,
  toggle,
  type ListingState,
} from "./listing";

type Facets = SearchResultDto["facets"];

function FilterTrigger({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`chip !min-h-10 shrink-0 ${count ? "!bg-ink !text-paper !shadow-none" : ""}`}
          aria-label={count ? `${label}, ${count} selected` : label}
        >
          {label}
          {count ? <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-paper/20 px-1 text-xs">{count}</span> : null}
          <Icon name="chevronDown" size={16} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))]" aria-label={`${label} filter`}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Facet values plus any selected value the current results no longer contain (count 0), so it can be unselected. */
function withSelected(values: FacetValueDto[], selected: string[], label: (id: string) => string): FacetValueDto[] {
  const known = new Set(values.map((v) => v.id));
  return [...values, ...selected.filter((id) => !known.has(id)).map((id) => ({ id, label: label(id), count: 0 }))];
}

function OptionGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-1.5">
      {children}
    </div>
  );
}

function Option({ label, count, pressed, swatch, onClick }: { label: string; count: number; pressed: boolean; swatch: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${label}, ${count} ${count === 1 ? "piece" : "pieces"}`}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2.5 rounded-[12px] px-2 text-left text-[0.9375rem] transition-[background-color,box-shadow] duration-200 hover:bg-plaster ${
        pressed ? "shadow-[inset_0_0_0_2px_var(--color-ink)]" : ""
      }`}
    >
      {swatch}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular text-[0.8125rem] text-stone">{count}</span>
    </button>
  );
}

function Swatch({ src }: { src?: string }) {
  return (
    <span className="swatch block size-7 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- texture swatch crop */}
      {src ? <img src={src} alt="" loading="lazy" /> : null}
    </span>
  );
}

function PriceFilter({ state, facet, onApply }: { state: ListingState; facet: Facets["price"] | undefined; onApply: (min: number | null, max: number | null) => void }) {
  const bounds = priceBounds(facet) ?? priceBounds(state.minCents !== null || state.maxCents !== null ? { minCents: state.minCents ?? 0, maxCents: state.maxCents ?? 100_000 } : null);
  const [min, setMin] = useState(state.minCents !== null ? String(state.minCents / 100) : "");
  const [max, setMax] = useState(state.maxCents !== null ? String(state.maxCents / 100) : "");
  const toCents = (raw: string) => (/^\d{1,7}$/.test(raw.trim()) ? Number(raw.trim()) * 100 : null);
  const minCents = toCents(min);
  const maxCents = toCents(max);
  const invalid = (min.trim() !== "" && minCents === null) || (max.trim() !== "" && maxCents === null) || (minCents !== null && maxCents !== null && minCents > maxCents);

  const apply = () => {
    if (!invalid) onApply(minCents, maxCents);
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <p className="label">Price</p>
      {bounds ? (
        <Slider
          className="mt-4"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          minStepsBetweenThumbs={0}
          value={[centsToPosition(minCents ?? bounds.lo, bounds), centsToPosition(maxCents ?? bounds.hi, bounds)]}
          onValueChange={([a, b]) => {
            setMin(String(positionToCents(a, bounds) / 100));
            setMax(String(positionToCents(b, bounds) / 100));
          }}
        />
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block text-[0.8125rem] text-stone">
          Minimum price (€)
          <input
            className="field mt-1 !min-h-11 tabular"
            inputMode="numeric"
            placeholder={bounds ? String(bounds.lo / 100) : "0"}
            value={min}
            aria-invalid={invalid || undefined}
            onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <label className="block text-[0.8125rem] text-stone">
          Maximum price (€)
          <input
            className="field mt-1 !min-h-11 tabular"
            inputMode="numeric"
            placeholder={bounds ? String(bounds.hi / 100) : "Any"}
            value={max}
            aria-invalid={invalid || undefined}
            onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
      </div>
      {invalid ? (
        <p className="hint !text-brick" role="alert">
          The minimum has to be below the maximum.
        </p>
      ) : bounds ? (
        <p className="hint tabular">
          Pieces here run from {money(bounds.lo)} to {money(bounds.hi)}.
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => {
            setMin("");
            setMax("");
            onApply(null, null);
          }}
        >
          Reset
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={invalid}>
          Apply price
        </button>
      </div>
    </form>
  );
}

export function FilterBar({
  state,
  facets,
  materials,
  onChange,
}: {
  state: ListingState;
  facets: Facets | undefined;
  materials: MaterialDto[];
  onChange: (next: ListingState) => void;
}) {
  const catalog = useCatalog();
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const colourSwatch = (family: string) => catalog.products.flatMap((p) => p.variants).find((v) => v.colorFamily === family)?.swatchUrl;
  const colours = withSelected(facets?.colors ?? [], state.colours, colourLabel);
  const materialFacets = withSelected(facets?.materials ?? [], state.materials, (id) => materialById.get(id)?.label ?? id);
  const priced = state.minCents !== null || state.maxCents !== null;
  const sorts = SORTS.filter((s) => !s.needsText || state.q.trim());

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...state.colours.map((c) => ({ key: `c-${c}`, label: colourLabel(c), remove: () => onChange({ ...state, colours: state.colours.filter((x) => x !== c) }) })),
    ...state.materials.map((m) => ({ key: `m-${m}`, label: materialById.get(m)?.label ?? m, remove: () => onChange({ ...state, materials: state.materials.filter((x) => x !== m) }) })),
    ...(priced
      ? [
          {
            key: "price",
            label:
              state.minCents !== null && state.maxCents !== null
                ? `${money(state.minCents)} to ${money(state.maxCents)}`
                : state.minCents !== null
                  ? `From ${money(state.minCents)}`
                  : `Up to ${money(state.maxCents ?? 0)}`,
            remove: () => onChange({ ...state, minCents: null, maxCents: null }),
          },
        ]
      : []),
    ...(state.inStock ? [{ key: "stock", label: "In stock", remove: () => onChange({ ...state, inStock: false }) }] : []),
  ];

  return (
    <div className="mt-6 border-y border-line py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <div className="no-scrollbar -mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <Icon name="sliders" size={20} className="mr-1 hidden shrink-0 text-stone sm:block" aria-hidden="true" />
          <FilterTrigger label="Colour" count={state.colours.length}>
            <OptionGrid label="Colour">
              {colours.length ? (
                colours.map((c) => (
                  <Option
                    key={c.id}
                    label={colourLabel(c.id)}
                    count={c.count}
                    pressed={state.colours.includes(c.id as ColorFamily)}
                    swatch={<Swatch src={colourSwatch(c.id)} />}
                    onClick={() => onChange({ ...state, colours: toggle(state.colours, c.id as ColorFamily) })}
                  />
                ))
              ) : (
                <p className="col-span-2 py-2 text-sm text-stone">No colours to choose from in these results.</p>
              )}
            </OptionGrid>
          </FilterTrigger>
          <FilterTrigger label="Material" count={state.materials.length}>
            <OptionGrid label="Material">
              {materialFacets.length ? (
                materialFacets.map((m) => (
                  <Option
                    key={m.id}
                    label={materialById.get(m.id)?.label ?? m.label}
                    count={m.count}
                    pressed={state.materials.includes(m.id)}
                    swatch={<Swatch src={materialById.get(m.id)?.swatchUrl} />}
                    onClick={() => onChange({ ...state, materials: toggle(state.materials, m.id) })}
                  />
                ))
              ) : (
                <p className="col-span-2 py-2 text-sm text-stone">No materials to choose from in these results.</p>
              )}
            </OptionGrid>
          </FilterTrigger>
          <FilterTrigger label="Price" count={priced ? 1 : 0}>
            <PriceFilter
              key={`${state.minCents}-${state.maxCents}`}
              state={state}
              facet={facets?.price}
              onApply={(minCents, maxCents) => onChange({ ...state, minCents, maxCents })}
            />
          </FilterTrigger>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-5 sm:justify-start">
          <label htmlFor="in-stock" className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap text-sm">
            <Switch id="in-stock" checked={state.inStock} onCheckedChange={(checked) => onChange({ ...state, inStock: checked })} />
            In stock only
            {facets ? (
              <span className="tabular text-stone" aria-hidden="true">
                {facets.inStockCount}
              </span>
            ) : null}
          </label>
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <span className="text-stone" aria-hidden="true">
              Sort
            </span>
            <Select value={state.sort} onValueChange={(value) => onChange({ ...state, sort: value as SearchSort })}>
              <SelectTrigger aria-label="Sort pieces" className="min-w-[11.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {chips.length ? (
        <ul className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button type="button" className="chip !min-h-8 !pr-2 tabular" onClick={chip.remove} aria-label={`Remove filter ${chip.label}`}>
                {chip.label}
                <Icon name="close" size={16} className="text-stone" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="link ml-1 text-sm" onClick={() => onChange(clearedFilters(state))}>
              Clear filters
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
