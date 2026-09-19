import { ArchiveProductHandler } from "./archive-product.handler";
import { EnsureReadModelHandler } from "./ensure-read-model.handler";
import { IndexProductHandler } from "./index-product.handler";
import { RebuildSearchIndexHandler } from "./rebuild-search-index.handler";
import { RecordStockEventHandler } from "./record-stock-event.handler";

export * from "./archive-product.command";
export * from "./archive-product.handler";
export * from "./ensure-read-model.command";
export * from "./ensure-read-model.handler";
export * from "./index-product.command";
export * from "./index-product.handler";
export * from "./rebuild-search-index.command";
export * from "./rebuild-search-index.handler";
export * from "./record-stock-event.command";
export * from "./record-stock-event.handler";

export const CommandHandlers = [IndexProductHandler, ArchiveProductHandler, RecordStockEventHandler, RebuildSearchIndexHandler, EnsureReadModelHandler];
