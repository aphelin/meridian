import type { ReservationDto, SkuQty } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";
import { UpstreamHttpError } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { InventoryReservations } from "../../application/ports";
import { UpstreamClients } from "./upstream-clients";

/** inventory-service reservations (service token, idempotent per order). */
@Injectable()
export class HttpInventoryReservations extends InventoryReservations {
  constructor(private readonly clients: UpstreamClients) {
    super();
  }

  async reserve(orderId: string, lines: SkuQty[]): Promise<void> {
    try {
      await this.clients.inventory.post<ReservationDto>("/reservations", { orderId, lines }, { idempotencyKey: `reserve-${orderId}` });
    } catch (error) {
      throw translate(error);
    }
  }

  async commit(orderId: string): Promise<void> {
    try {
      await this.clients.inventory.post<ReservationDto>(`/reservations/${encodeURIComponent(orderId)}/commit`, undefined, { idempotencyKey: `commit-${orderId}` });
    } catch (error) {
      throw translate(error);
    }
  }
}

/** OUT_OF_STOCK keeps inventory's shopper-safe message and details; any other upstream rejection is an outage to us. */
function translate(error: unknown): unknown {
  if (!(error instanceof UpstreamHttpError)) return error;
  if (error.code === "OUT_OF_STOCK") return new DomainError("OUT_OF_STOCK", error.message, error.details);
  return new DomainError("UPSTREAM_UNAVAILABLE", "Stock could not be checked right now. Please try again shortly.", { upstream: "inventory", status: error.status, code: error.code });
}
