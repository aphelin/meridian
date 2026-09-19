import { DomainError } from "@meridian/kernel";
import { UpstreamHttpError } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { type CatalogPrice, CatalogPricing } from "../../application/ports";
import { UpstreamClients } from "./upstream-clients";

/** catalog-service `GET /prices?skus=` (service token). */
@Injectable()
export class HttpCatalogPricing extends CatalogPricing {
  constructor(private readonly clients: UpstreamClients) {
    super();
  }

  async pricesFor(skus: string[]): Promise<CatalogPrice[]> {
    if (skus.length === 0) return [];
    const query = skus.map((sku) => encodeURIComponent(sku)).join(",");
    let prices: CatalogPrice[];
    try {
      prices = await this.clients.catalog.get<CatalogPrice[]>(`/prices?skus=${query}`);
    } catch (error) {
      // Never surface catalog's own 4xx (e.g. a rejected service token) as the shopper's error.
      if (error instanceof UpstreamHttpError) throw new DomainError("UPSTREAM_UNAVAILABLE", "Prices could not be loaded right now. Please try again shortly.", { upstream: "catalog", status: error.status });
      throw error;
    }
    if (!Array.isArray(prices)) return [];
    // Only `true` stops a sale: a catalog without the flag (pre amendment 1p) never marked anything sold out.
    return prices.filter((price) => skus.includes(price.sku)).map((price) => ({ ...price, soldOut: price.soldOut === true }));
  }
}
