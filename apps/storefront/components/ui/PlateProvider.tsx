"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlateInfo, PlateMap } from "@/lib/plates";

const PlateContext = createContext<PlateMap>({});

export function PlateProvider({ plates, children }: { plates: PlateMap; children: ReactNode }) {
  return <PlateContext.Provider value={plates}>{children}</PlateContext.Provider>;
}

export function usePlate(src: string): PlateInfo | undefined {
  return useContext(PlateContext)[src];
}
