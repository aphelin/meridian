export * from "./adjust-stock.command";
export * from "./adjust-stock.handler";
export * from "./commit-reservation.command";
export * from "./commit-reservation.handler";
export * from "./create-stock-items.command";
export * from "./create-stock-items.handler";
export * from "./expire-reservations.command";
export * from "./expire-reservations.handler";
export * from "./release-reservation.command";
export * from "./release-reservation.handler";
export * from "./reserve-stock.command";
export * from "./reserve-stock.handler";
export * from "./restock-items.command";
export * from "./restock-items.handler";

import { AdjustStockHandler } from "./adjust-stock.handler";
import { CommitReservationHandler } from "./commit-reservation.handler";
import { SeedStockHandler, SyncCatalogStockHandler } from "./create-stock-items.handler";
import { ExpireReservationsHandler } from "./expire-reservations.handler";
import { ReleaseReservationHandler } from "./release-reservation.handler";
import { ReserveStockHandler } from "./reserve-stock.handler";
import { RestockItemsHandler } from "./restock-items.handler";

export const CommandHandlers = [
  ReserveStockHandler,
  CommitReservationHandler,
  ReleaseReservationHandler,
  ExpireReservationsHandler,
  RestockItemsHandler,
  AdjustStockHandler,
  SeedStockHandler,
  SyncCatalogStockHandler,
];
