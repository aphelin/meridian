"use client";

import { useEffect, useState } from "react";

/**
 * Keeps an emailed one-time token in memory and removes it from the address bar, so it doesn't linger in history,
 * screenshots or bookmarks once the page has read it.
 */
export function useOneTimeToken(initial: string | null): string | null {
  const [token] = useState(initial);
  useEffect(() => {
    if (!token) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [token]);
  return token;
}
