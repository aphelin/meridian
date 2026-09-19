"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MaterialDto } from "@meridian/contracts";
import { useCatalog } from "@/lib/catalog-context";
import { Icon } from "../ui/Icon";
import { Listing, type ListingSeed } from "./Listing";
import { defaultSort, listingQuery, type ListingState } from "./listing";

const popular = ["oak", "wool sofa", "lamp", "leather", "walnut", "velvet"];

/** /search: full-text search on the read model with typo tolerance ("Did you mean"), filters, sort and "Load more". */
export function SearchView({ initial, materials, seed }: { initial: ListingState; materials: MaterialDto[]; seed?: ListingSeed }) {
  const path = usePathname();
  const [text, setText] = useState(initial.q);
  const [state, setState] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const catalog = useCatalog();
  const categories = [...catalog.categories].sort((a, b) => a.position - b.position);

  const commit = (next: ListingState) => {
    setState(next);
    const query = listingQuery(next);
    window.history.replaceState(window.history.state, "", query ? `${path}?${query}` : path);
  };

  const withText = (q: string): ListingState => {
    // A sort the shopper never picked follows the query: best match while searching, featured without text.
    const sort = state.sort === defaultSort(state.q) ? defaultSort(q) : state.sort === "relevance" && !q.trim() ? "featured" : state.sort;
    return { ...state, q, sort };
  };

  useEffect(() => {
    if (text.trim() === state.q.trim()) return;
    const t = window.setTimeout(() => commit(withText(text)), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit/withText only read `state`, which is listed
  }, [text, state]);

  const needle = state.q.trim();

  return (
    <main className="shell pt-8 md:pt-14">
      <h1 className="title">{needle ? <>Results for “{needle}”</> : "Search"}</h1>
      <form
        role="search"
        // From lg the field spans three of the four result columns (75% less a quarter of the grid gap).
        className="relative mt-6 max-w-3xl lg:w-[calc(75%-5px)] lg:max-w-none xl:w-[calc(75%-6px)]"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          // An empty search has nothing to look for: the popular searches below already show.
          if (!text.trim()) return;
          commit(withText(text));
          input.current?.blur();
        }}
      >
        <label htmlFor="search-input" className="sr-only">
          Search the collection
        </label>
        <Icon name="search" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-stone" />
        <input
          ref={input}
          id="search-input"
          type="search"
          autoFocus={!initial.q}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={200}
          placeholder="Search pieces, materials, colours"
          className="field !min-h-16 !rounded-full !pl-14 !pr-28 text-lg [&::-webkit-search-cancel-button]:hidden"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text ? (
          <button
            type="button"
            className="btn btn-quiet btn-sm absolute right-2.5 top-1/2 -translate-y-1/2"
            onClick={() => {
              setText("");
              commit(withText(""));
              input.current?.focus();
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {!needle ? (
        <div className="mt-10">
          <p className="text-sm font-medium">Popular searches</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {popular.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => {
                  setText(s);
                  commit(withText(s));
                }}
              >
                <Icon name="search" size={15} className="text-stone" />
                {s}
              </button>
            ))}
          </div>
          <p className="mt-10 text-sm font-medium">Or browse a category</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link key={c.id} href={`/shop/${c.id}`} className="chip">
                {c.label}
                <Icon name="arrowRight" size={16} />
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <Listing
          state={state}
          onChange={commit}
          materials={materials}
          seed={seed}
          emptyTitle={`No pieces match “${needle}”`}
          emptyHint="Check the spelling, try a material like oak, wool or brass, or loosen the filters."
          header={(first) =>
            first?.didYouMean ? (
              <p className="mt-6 text-[1.0625rem]" role="status">
                Did you mean{" "}
                <Link
                  href={`/search?q=${encodeURIComponent(first.didYouMean)}`}
                  className="link font-medium"
                  onClick={(e) => {
                    e.preventDefault();
                    const q = first.didYouMean ?? "";
                    setText(q);
                    commit(withText(q));
                  }}
                >
                  {first.didYouMean}
                </Link>
                ?{" "}
                <span className="text-stone">Showing close matches for “{needle}”.</span>
              </p>
            ) : null
          }
        />
      )}
    </main>
  );
}
