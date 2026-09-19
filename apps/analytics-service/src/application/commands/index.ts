import { ProjectOrderFactHandler } from "./project-order-fact.handler";
import { RebuildProjectionsHandler } from "./rebuild-projections.handler";

export * from "./project-order-fact.command";
export * from "./project-order-fact.handler";
export * from "./rebuild-projections.command";
export * from "./rebuild-projections.handler";

export const CommandHandlers = [ProjectOrderFactHandler, RebuildProjectionsHandler];
