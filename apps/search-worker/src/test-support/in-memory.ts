import { SearchIndexMaintenance, IndexReplayer, SearchReadModel, type SearchPage, type SearchPlan, type SuggestionRow } from "../application/ports";
import { SearchDocument, SearchDocumentRepository, SkuAvailability, SkuAvailabilityRepository, type ChangeResult } from "../domain";

export class InMemorySearchDocuments extends SearchDocumentRepository {
  readonly docs = new Map<string, SearchDocument>();
  async change(productId: string, change: (current: SearchDocument | null) => SearchDocument | null): Promise<ChangeResult> {
    const next = change(this.docs.get(productId) ?? null);
    if (!next) return "unchanged";
    this.docs.set(productId, next);
    return "written";
  }
}

export class InMemorySkuAvailability extends SkuAvailabilityRepository {
  readonly skus = new Map<string, SkuAvailability>();
  async change(sku: string, change: (current: SkuAvailability | null) => SkuAvailability | null): Promise<ChangeResult> {
    const next = change(this.skus.get(sku) ?? null);
    if (!next) return "unchanged";
    this.skus.set(sku, next);
    return "written";
  }
}

export const emptyPage = (): SearchPage => ({ rows: [], total: 0, facets: { categories: [], materials: [], colors: [], price: null, inStockCount: 0 } });

/** Records plans and returns scripted pages. */
export class ScriptedReadModel extends SearchReadModel {
  readonly plans: SearchPlan[] = [];
  fullTextMatches = true;
  closest: string | null = null;
  page: SearchPage = emptyPage();
  suggestions: SuggestionRow[] = [];
  suggestCalls: unknown[][] = [];

  async hasFullTextMatch(): Promise<boolean> {
    return this.fullTextMatches;
  }
  async closestName(): Promise<string | null> {
    return this.closest;
  }
  async search(plan: SearchPlan): Promise<SearchPage> {
    this.plans.push(plan);
    return this.page;
  }
  async suggest(...args: [string, string, number, number]): Promise<SuggestionRow[]> {
    this.suggestCalls.push(args);
    return this.suggestions;
  }
}

export class FakeMaintenance extends SearchIndexMaintenance {
  empty = true;
  truncations = 0;
  async isEmpty(): Promise<boolean> {
    return this.empty;
  }
  async truncate(): Promise<void> {
    this.truncations += 1;
    this.empty = true;
  }
}

export class FakeReplayer extends IndexReplayer {
  committed = false;
  replays = 0;
  readonly log: string[] = [];
  async hasCommittedProgress(): Promise<boolean> {
    return this.committed;
  }
  running = false;
  isReplaying(): boolean {
    return this.running;
  }
  async replayFromEarliest(reset: () => Promise<void>): Promise<void> {
    this.log.push("stop-consumers", "reset-offsets");
    await reset();
    this.log.push("start-consumers");
    this.replays += 1;
  }
}
