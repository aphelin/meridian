import { randomBytes } from "node:crypto";
import { expect, generatedPng, mutate, pickVariant, query, test } from "./fixtures";

type Snapshot = { categories: { id: string; label: string }[]; materials: { id: string; label: string }[]; products: { heroImageUrl: string }[] };

const tag = () => randomBytes(3).toString("hex");

test("product create with a variant, publish and archive", async ({ page, admin }) => {
  const snapshot = await query<Snapshot>(admin, "catalog.snapshot");
  const id = tag();
  const name = `E2E Admin Lamp ${id}`;
  const slug = `e2e-admin-lamp-${id}`;

  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "New product" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New product" })).toBeVisible();

  const form = page.getByRole("form", { name: "New product" });
  await form.getByRole("button", { name: "Create draft" }).click();
  await expect(form.getByText("Enter a name.")).toBeVisible();

  await form.getByLabel("Name").fill(name);
  await expect(form.getByLabel("Slug")).toHaveValue(slug);
  await form.getByLabel("Kind").fill("Table lamp");
  await form.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: snapshot.categories[0].label }).click();
  await form.getByLabel("Price (€, VAT included)").fill("149");
  await form.getByLabel("Story").fill("A small end-to-end test lamp with a linen shade.");
  await form.getByRole("checkbox", { name: snapshot.materials[0].label }).click();
  await form.getByLabel("Hero image URL").fill(snapshot.products[0].heroImageUrl);
  await form.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/admin\/products\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const status = page.getByRole("region", { name: "Status" });
  await expect(status.getByText("Add at least one variant to publish.")).toBeVisible();

  // Publishing without variants is refused by catalog-service and explained.
  await status.getByRole("button", { name: "Publish" }).click();
  await expect(status.getByRole("alert")).toContainText("Status change refused", { timeout: 20_000 });

  const variants = page.getByRole("region", { name: "Variants" });
  await variants.getByRole("button", { name: "Add variant" }).click();
  const variant = variants.getByRole("group", { name: "Variant 1" });
  await variants.getByRole("button", { name: "Save variants" }).click();
  await expect(variant.getByText("Enter a finish label.")).toBeVisible();
  await variant.getByLabel("Label").fill("Natural linen");
  await variant.getByRole("combobox", { name: "Colour family" }).click();
  await page.getByRole("option", { name: "White" }).click();
  await expect(variant.getByLabel("SKU")).toHaveValue(`${slug.toUpperCase()}-1`);
  await variants.getByRole("button", { name: "Save variants" }).click();
  await expect(page.getByText("Saved 1 variant")).toBeVisible({ timeout: 20_000 });

  await status.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(`“${name}” is published`)).toBeVisible({ timeout: 20_000 });
  await expect(status.getByRole("link", { name: "View in shop" })).toHaveAttribute("href", `/product/${slug}`);
  const published = await query<{ status: string; variants: { sku: string }[] }>(admin, "catalog.product", { slug });
  expect(published.status).toBe("published");
  expect(published.variants.map((v) => v.sku)).toEqual([`${slug.toUpperCase()}-1`]);

  await status.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("dialog", { name: `Archive “${name}”?` }).getByRole("button", { name: "Archive product" }).click();
  await expect(page.getByText(`“${name}” is archived`)).toBeVisible({ timeout: 20_000 });
  await expect(status.getByRole("button", { name: "Publish" })).toBeVisible();
});

test("product image upload through a presigned PUT, then attach and remove", async ({ page, admin }) => {
  const snapshot = await query<Snapshot>(admin, "catalog.snapshot");
  const id = tag();
  const product = await mutate<{ id: string; name: string }>(admin, "admin.products.create", {
    slug: `e2e-admin-image-${id}`,
    name: `E2E Admin Image ${id}`,
    kind: "Side table",
    story: "Created by the admin image upload test.",
    categoryId: snapshot.categories[0].id,
    materials: [],
    priceCents: 9900,
    featured: false,
    soldOut: false,
    heroImageUrl: snapshot.products[0].heroImageUrl,
    detailImageUrl: null,
    details: { widthCm: null, depthCm: null, heightCm: null, weightKg: null, construction: null, care: null },
  });

  await page.goto(`/admin/products/${product.id}`);
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible({ timeout: 30_000 });
  const upload = page.getByRole("form", { name: "Upload image" });
  await upload.getByRole("button", { name: "Upload image" }).click();
  await expect(upload.getByText("Choose a JPEG, PNG or WebP image.")).toBeVisible();

  await upload.getByLabel("Image file").setInputFiles({ name: "e2e-swatch.png", mimeType: "image/png", buffer: generatedPng() });
  await upload.getByLabel("Alt text").fill(`E2E oak swatch ${id}`);
  const put = page.waitForRequest((r) => r.method() === "PUT" && /X-Amz-Signature=/.test(r.url()));
  await upload.getByRole("button", { name: "Upload image" }).click();
  expect((await put).headers()["content-type"]).toBe("image/png");
  await expect(page.getByText("Image uploaded and attached")).toBeVisible({ timeout: 30_000 });

  const gallery = page.getByRole("list", { name: "Product images" });
  const image = gallery.getByRole("img", { name: `E2E oak swatch ${id}` });
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 20_000 }).toBe(24);
  const stored = await query<{ images: { url: string; alt: string }[] }>(admin, "admin.products.byId", { id: product.id });
  expect(stored.images.map((i) => i.alt)).toEqual([`E2E oak swatch ${id}`]);

  await gallery.getByRole("button", { name: `Remove image E2E oak swatch ${id}` }).click();
  await expect(page.getByText("Image removed")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("No uploaded images yet.")).toBeVisible({ timeout: 20_000 });
});

test("stock adjustment with a reason shows up in the SKU's movements", async ({ page, admin }) => {
  const pick = await pickVariant(admin);
  const reason = `E2E cycle count ${tag()}`;
  await page.goto("/admin/stock");
  await expect(page.getByRole("heading", { level: 1, name: "Stock" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("searchbox", { name: "Filter stock" }).fill(pick.sku);
  const table = page.getByRole("table", { name: "Stock levels" });
  const row = table.getByRole("row").filter({ has: page.getByRole("cell", { name: pick.sku, exact: true }) });
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  const onHandBefore = Number(await row.getByRole("cell").nth(2).textContent());

  await table.getByRole("button", { name: `Adjust ${pick.sku}` }).click();
  const dialog = page.getByRole("dialog", { name: "Adjust stock" });
  await dialog.getByRole("button", { name: "Save adjustment" }).click();
  await expect(dialog.getByText("Enter a whole number.")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Change by" })).toBeChecked();
  await dialog.getByLabel("Change (use a minus sign to remove)").fill("3");
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.getByText(`${pick.sku} now has ${onHandBefore + 3} on hand`)).toBeVisible({ timeout: 20_000 });
  await expect(row.getByRole("cell").nth(2)).toHaveText(String(onHandBefore + 3));

  await table.getByRole("button", { name: `Movements for ${pick.sku}` }).click();
  const movements = page.getByRole("dialog", { name: "Stock movements" });
  const entry = movements.getByRole("listitem").filter({ hasText: reason });
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText("+3");
  await expect(entry).toContainText(`${onHandBefore + 3} after`);
});

test("coupon create, edit and deactivate", async ({ page }) => {
  const code = `E2E-${tag().toUpperCase()}`;
  await page.goto("/admin/coupons");
  await expect(page.getByRole("heading", { level: 1, name: "Coupons" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "New coupon" }).click();

  const create = page.getByRole("dialog", { name: "New coupon" });
  await create.getByLabel("Code").fill(code);
  await create.getByLabel("Discount (%)").fill("150");
  await create.getByRole("button", { name: "Create coupon" }).click();
  await expect(create.getByText("Enter a whole percentage from 1 to 100.")).toBeVisible();
  await create.getByLabel("Discount (%)").fill("15");
  await create.getByLabel("Minimum basket (€)").fill("200");
  await create.getByRole("checkbox", { name: "Once per customer" }).click();
  await create.getByRole("button", { name: "Create coupon" }).click();
  await expect(page.getByText(`Coupon ${code} created`)).toBeVisible({ timeout: 20_000 });

  const row = page.getByRole("table", { name: "Coupons" }).getByRole("row").filter({ hasText: code });
  await expect(row).toContainText("15% off");
  await expect(row).toContainText("€200");
  await expect(row).toContainText("Once per customer");

  await row.getByRole("button", { name: `Edit ${code}` }).click();
  const edit = page.getByRole("dialog", { name: `Edit ${code}` });
  await expect(edit.getByLabel("Code")).toBeDisabled();
  await edit.getByLabel("Discount (%)").fill("20");
  await edit.getByLabel("Maximum redemptions").fill("50");
  await edit.getByRole("button", { name: "Save coupon" }).click();
  await expect(page.getByText(`Coupon ${code} updated`)).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("20% off");
  await expect(row).toContainText("0 / 50");

  const active = row.getByRole("switch", { name: `${code} active` });
  await expect(active).toBeChecked();
  await active.click();
  await expect(page.getByText(`Coupon ${code} deactivated`)).toBeVisible({ timeout: 20_000 });
  await expect(active).not.toBeChecked();
});
