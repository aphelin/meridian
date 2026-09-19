/* In-memory fakes for domain and application unit tests (never compiled into dist). */
import type { CatalogSnapshotDto, CategoryDto, EventName, MaterialDto, ProductDto, ReviewDto } from "@meridian/contracts";
import { FixedClock } from "@meridian/kernel";
import type { OutboxWriter } from "@meridian/nest-kit";
import { CatalogCache } from "../application/ports/catalog-cache";
import { CatalogReadModel, type ProductListFilter, type ProductListSlice, type ReviewPosition, type ReviewSlice, type SkuPriceDto } from "../application/ports/catalog-read-model";
import { MediaStorage, type StoredObject, type UploadUrl } from "../application/ports/media-storage";
import { TransactionRunner, type Tx } from "../application/ports/transaction";
import type { Category, Material } from "../domain/catalog/category";
import { ReferenceDataRepository } from "../domain/catalog/reference-data.repository";
import { Product, type ProductContentInput } from "../domain/product/product";
import { ProductRepository } from "../domain/product/product.repository";
import type { PurchaseRecord } from "../domain/review/purchase-record";
import { Review } from "../domain/review/review";
import { PurchaseRecordRepository, ReviewRepository } from "../domain/review/review.repository";
import { Wishlist } from "../domain/wishlist/wishlist";
import { WishlistRepository } from "../domain/wishlist/wishlist.repository";

export const NOW = new Date("2026-09-17T10:00:00.000Z");
export const clock = () => new FixedClock(NOW);

export function content(overrides: Partial<ProductContentInput> = {}): ProductContentInput {
  return {
    slug: "holt-sofa",
    name: "Holt",
    kind: "Three-seat sofa",
    story: "Three seats. Walnut legs set back.",
    categoryId: "seating",
    materials: ["walnut", "wool"],
    priceCents: 240_000,
    featured: true,
    soldOut: false,
    heroImageUrl: "/products/holt-sofa-hero.jpg",
    detailImageUrl: "/products/holt-sofa-detail-photo.jpg",
    details: { widthCm: 240, depthCm: 92, heightCm: 78, weightKg: 68, construction: "Kiln-dried beech frame.", care: "Vacuum on low." },
    ...overrides,
  };
}

export const variant = (id: string, sku: string, material = "wool") => ({
  id,
  sku,
  label: `${id} ${material}`,
  colorFamily: "grey" as const,
  material,
  swatchUrl: `/materials/${material}.jpg`,
  imageUrl: `/products/x-${id}.jpg`,
});

export function publishedProduct(id = "prd_holt", overrides: Partial<ProductContentInput> = {}): Product {
  const product = Product.createDraft(id, content(overrides), NOW);
  product.replaceVariants([variant("oatmeal", `${id.toUpperCase().replace(/[^A-Z0-9]/g, "")}-OAT`), variant("charcoal", `${id.toUpperCase().replace(/[^A-Z0-9]/g, "")}-CHA`)], NOW);
  product.publish(NOW);
  product.pullEvents();
  return product;
}

/** A transaction handle whose raw inserts behave like the Inbox table (ON CONFLICT DO NOTHING). */
export class FakeTx {
  static readonly inbox = new Set<string>();
  readonly $executeRaw = async (_: TemplateStringsArray, ...values: unknown[]) => {
    const key = values.map(String).join("|");
    if (FakeTx.inbox.has(key)) return 0;
    FakeTx.inbox.add(key);
    return 1;
  };
  readonly $queryRaw = async () => [] as never;
}

export class FakeTransactions extends TransactionRunner {
  runs = 0;
  async run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    this.runs++;
    return work(new FakeTx());
  }
}

export interface OutboxRow {
  name: EventName;
  aggregate: { type: string; id: string };
  payload: any;
}

export function fakeOutbox(): OutboxWriter & { rows: OutboxRow[] } {
  const rows: OutboxRow[] = [];
  return {
    rows,
    event: async (_tx: unknown, name: EventName, aggregate: { type: string; id: string }, payload: unknown) => {
      rows.push({ name, aggregate, payload });
      return `msg-${rows.length}`;
    },
    command: async () => "cmd",
  } as unknown as OutboxWriter & { rows: OutboxRow[] };
}

export class InMemoryProducts extends ProductRepository {
  readonly byId = new Map<string, Product>();
  saves = 0;

  constructor(...products: Product[]) {
    super();
    for (const p of products) this.byId.set(p.id, clone(p));
  }

  async findById(id: string) {
    const p = this.byId.get(id);
    return p ? clone(p) : null;
  }
  async findBySlug(slug: string) {
    const p = [...this.byId.values()].find((x) => x.slug === slug);
    return p ? clone(p) : null;
  }
  async slugOwner(slug: string) {
    return [...this.byId.values()].find((x) => x.slug === slug)?.id ?? null;
  }
  async skuOwners(skus: readonly string[]) {
    const owners = new Map<string, string>();
    for (const p of this.byId.values()) for (const v of p.variants) if (skus.includes(v.sku)) owners.set(v.sku, p.id);
    return owners;
  }
  async publishedSlugs(slugs: readonly string[]) {
    return new Set([...this.byId.values()].filter((p) => p.isPublished && slugs.includes(p.slug)).map((p) => p.slug));
  }
  async publishedIdsInCategory(categoryId: string) {
    return [...this.byId.values()].filter((p) => p.isPublished && p.categoryId === categoryId).map((p) => p.id);
  }
  async lockCatalog() {}
  async save(product: Product) {
    this.saves++;
    this.byId.set(product.id, clone(product));
  }
}

function clone(product: Product): Product {
  return Product.restore(product.toState());
}

export class InMemoryReferenceData extends ReferenceDataRepository {
  constructor(
    readonly cats: Category[] = [{ id: "seating", label: "Seating", blurb: "Sofas.", coverImageUrl: "/products/a.jpg", position: 0 }],
    readonly mats: Material[] = ["oak", "walnut", "wool"].map((id, position) => ({ id, label: id, swatchUrl: `/materials/${id}.jpg`, position })),
  ) {
    super();
  }
  async categories() {
    return this.cats.map((c) => ({ ...c }));
  }
  async materials() {
    return this.mats.map((m) => ({ ...m }));
  }
  async saveCategory(category: Category) {
    const i = this.cats.findIndex((c) => c.id === category.id);
    if (i >= 0) this.cats[i] = category;
    else this.cats.push(category);
  }
  async saveMaterial(material: Material) {
    const i = this.mats.findIndex((m) => m.id === material.id);
    if (i >= 0) this.mats[i] = material;
    else this.mats.push(material);
  }
}

export class InMemoryReviews extends ReviewRepository {
  readonly rows = new Map<string, Review>();
  async existsFor(productId: string, userId: string) {
    return [...this.rows.values()].some((r) => r.toState().productId === productId && r.toState().userId === userId);
  }
  async findByUser(userId: string) {
    return [...this.rows.values()].filter((r) => r.toState().userId === userId).map((r) => Review.restore(r.toState()));
  }
  async save(review: Review) {
    this.rows.set(review.id, Review.restore(review.toState()));
  }
}

export class InMemoryPurchases extends PurchaseRecordRepository {
  readonly rows = new Map<string, PurchaseRecord>();
  async find(userId: string, slug: string) {
    return this.rows.get(`${userId}|${slug}`) ?? null;
  }
  async record(record: PurchaseRecord) {
    const key = `${record.userId}|${record.slug}`;
    if (!this.rows.has(key)) this.rows.set(key, record);
  }
  async deleteByUser(userId: string) {
    let n = 0;
    for (const key of [...this.rows.keys()]) if (key.startsWith(`${userId}|`)) n += Number(this.rows.delete(key));
    return n;
  }
}

export class InMemoryWishlists extends WishlistRepository {
  readonly lists = new Map<string, string[]>();
  async loadForUpdate(userId: string) {
    const slugs = this.lists.get(userId);
    return slugs ? Wishlist.restore(userId, slugs) : Wishlist.empty(userId);
  }
  async save(wishlist: Wishlist) {
    this.lists.set(wishlist.userId, [...wishlist.slugs]);
  }
  async deleteByUser(userId: string) {
    const n = this.lists.get(userId)?.length ?? 0;
    this.lists.delete(userId);
    return n;
  }
}

export class FakeCache extends CatalogCache {
  readonly store = new Map<string, unknown>();
  invalidations = 0;
  async readThrough<T>(key: string, _ttl: number, load: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) return this.store.get(key) as T;
    const value = await load();
    this.store.set(key, value);
    return value;
  }
  async invalidate() {
    this.invalidations++;
    this.store.clear();
  }
}

/** Read model over the in-memory repositories (just enough DTO for handler tests). */
export class FakeReadModel extends CatalogReadModel {
  snapshotLoads = 0;
  lastFilter: ProductListFilter | null = null;
  priceRows: SkuPriceDto[] = [];
  constructor(
    private readonly products = new InMemoryProducts(),
    private readonly reviewRepo = new InMemoryReviews(),
    private readonly wishlists = new InMemoryWishlists(),
  ) {
    super();
  }
  private dto(p: Product): ProductDto {
    const s = p.toState();
    return { id: s.id, slug: s.slug, name: s.name, status: s.status, priceCents: s.priceCents, rating: { average: s.rating.average, count: s.rating.count, distribution: s.rating.distribution } } as ProductDto;
  }
  async snapshot(): Promise<CatalogSnapshotDto> {
    this.snapshotLoads++;
    return { categories: [], materials: [], products: [...this.products.byId.values()].filter((p) => p.isPublished).map((p) => this.dto(p)) };
  }
  async categories(): Promise<CategoryDto[]> {
    return [];
  }
  async materials(): Promise<MaterialDto[]> {
    return [];
  }
  async listProducts(filter: ProductListFilter): Promise<ProductListSlice> {
    this.lastFilter = filter;
    const all = [...this.products.byId.values()].filter((p) => filter.statuses.includes(p.status));
    const start = filter.afterSeq ?? 0;
    const page = all.slice(start, start + filter.limit);
    return { items: page.map((p) => this.dto(p)), nextSeq: start + filter.limit < all.length ? start + filter.limit : null };
  }
  async productBySlug(slug: string) {
    const p = await this.products.findBySlug(slug);
    return p ? this.dto(p) : null;
  }
  async productById(id: string) {
    const p = await this.products.findById(id);
    return p ? this.dto(p) : null;
  }
  async prices(skus: readonly string[]) {
    return this.priceRows.filter((r) => skus.includes(r.sku));
  }
  async reviews(_productId: string, _after: ReviewPosition | null, _limit: number): Promise<ReviewSlice> {
    return { items: [], next: null };
  }
  async review(id: string): Promise<ReviewDto | null> {
    const r = this.reviewRepo.rows.get(id)?.toState();
    return r ? { id: r.id, rating: r.rating, title: r.title, body: r.body, authorName: r.authorName, verifiedPurchase: true, createdAt: r.createdAt.toISOString() } : null;
  }
  async wishlist(userId: string) {
    const slugs = this.wishlists.lists.get(userId) ?? [];
    const published = await this.products.publishedSlugs(slugs);
    return slugs.filter((s) => published.has(s));
  }
}

export class FakeStorage extends MediaStorage {
  readonly objects = new Map<string, StoredObject>();
  readonly deleted: string[] = [];
  async createUploadUrl(objectKey: string, _contentType: string, expiresInSec: number): Promise<UploadUrl> {
    return { uploadUrl: `http://minio.test/meridian-media/${objectKey}?sig=1`, expiresAt: new Date(NOW.getTime() + expiresInSec * 1000) };
  }
  async stat(objectKey: string) {
    return this.objects.get(objectKey) ?? null;
  }
  async delete(objectKey: string) {
    this.deleted.push(objectKey);
    this.objects.delete(objectKey);
  }
  publicUrl(objectKey: string) {
    return `http://minio.test/meridian-media/${objectKey}`;
  }
}
