"use client";

import type { ColorFamily, ProductDto, ProductInput, VariantInput } from "@meridian/contracts";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCatalog } from "@/lib/catalog-context";
import { colourLabel, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { focusFirstInvalid } from "@/lib/validation";
import { EmptyState, ErrorState, eurosInput, Field, parseEuros, Section } from "./kit";
import { ProductStatusChip } from "./Products";

const COLOR_FAMILIES: ColorFamily[] = ["neutral", "white", "black", "grey", "brown", "green", "blue", "red", "orange", "yellow", "pink", "metal"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

type FormState = {
  name: string;
  slug: string;
  kind: string;
  story: string;
  categoryId: string;
  materials: string[];
  price: string;
  featured: boolean;
  soldOut: boolean;
  heroImageUrl: string;
  detailImageUrl: string;
  widthCm: string;
  depthCm: string;
  heightCm: string;
  weightKg: string;
  construction: string;
  care: string;
};

function toForm(p?: ProductDto): FormState {
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    kind: p?.kind ?? "",
    story: p?.story ?? "",
    categoryId: p?.categoryId ?? "",
    materials: p?.materials ?? [],
    price: p ? eurosInput(p.priceCents) : "",
    featured: p?.featured ?? false,
    soldOut: p?.soldOut ?? false,
    heroImageUrl: p?.heroImageUrl ?? "",
    detailImageUrl: p?.detailImageUrl ?? "",
    widthCm: n(p?.details.widthCm),
    depthCm: n(p?.details.depthCm),
    heightCm: n(p?.details.heightCm),
    weightKg: n(p?.details.weightKg),
    construction: p?.details.construction ?? "",
    care: p?.details.care ?? "",
  };
}

function measure(text: string): number | null | "invalid" {
  if (!text.trim()) return null;
  const v = Number(text.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : "invalid";
}

function validate(f: FormState): { input: ProductInput | null; errors: Partial<Record<keyof FormState, string>> } {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.name.trim()) errors.name = "Enter a name.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug)) errors.slug = "Use lower-case letters, numbers and single hyphens.";
  if (!f.kind.trim()) errors.kind = "Describe the kind of piece, like “Three-seat sofa”.";
  if (!f.story.trim()) errors.story = "Write a short story for the product page.";
  if (!f.categoryId) errors.categoryId = "Choose a category.";
  const priceCents = parseEuros(f.price);
  if (priceCents === null || priceCents <= 0) errors.price = "Enter a price in euros, like 1290.";
  const url = /^(\/\S*|https?:\/\/\S+)$/;
  if (!url.test(f.heroImageUrl.trim())) errors.heroImageUrl = "Use a site path such as /products/holt-sofa.jpg or an http(s) URL.";
  if (f.detailImageUrl.trim() && !url.test(f.detailImageUrl.trim())) errors.detailImageUrl = "Use a site path or an http(s) URL.";
  const dims = { widthCm: measure(f.widthCm), depthCm: measure(f.depthCm), heightCm: measure(f.heightCm), weightKg: measure(f.weightKg) };
  for (const [k, v] of Object.entries(dims)) if (v === "invalid") errors[k as keyof FormState] = "Enter a positive number or leave it empty.";
  if (Object.keys(errors).length || priceCents === null) return { input: null, errors };
  return {
    errors,
    input: {
      name: f.name.trim(),
      slug: f.slug,
      kind: f.kind.trim(),
      story: f.story.trim(),
      categoryId: f.categoryId,
      materials: f.materials,
      priceCents,
      featured: f.featured,
      soldOut: f.soldOut,
      heroImageUrl: f.heroImageUrl.trim(),
      detailImageUrl: f.detailImageUrl.trim() || null,
      details: {
        widthCm: dims.widthCm as number | null,
        depthCm: dims.depthCm as number | null,
        heightCm: dims.heightCm as number | null,
        weightKg: dims.weightKg as number | null,
        construction: f.construction.trim() || null,
        care: f.care.trim() || null,
      },
    },
  };
}

function ProductForm({ product }: { product?: ProductDto }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const catalog = useCatalog();
  const [form, setForm] = useState(() => toForm(product));
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [touched, setTouched] = useState(false);
  const { input, errors } = validate(form);
  const shown = touched ? errors : {};

  const create = trpc.admin.products.create.useMutation({
    onSuccess: (created) => {
      toast.success(`Draft “${created.name}” created`, { description: "Add variants, then publish it." });
      void utils.admin.products.list.invalidate();
      router.push(`/admin/products/${created.id}`);
    },
  });
  const update = trpc.admin.products.update.useMutation({
    onSuccess: (saved) => {
      toast.success("Product saved");
      utils.admin.products.byId.setData({ id: saved.id }, saved);
      void utils.admin.products.list.invalidate();
    },
  });
  const saving = create.isPending || update.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof FormState, id: string) => ({
    id,
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
    "aria-invalid": Boolean(shown[key]),
    "aria-describedby": shown[key] ? `${id}-error` : undefined,
  });

  return (
    <form
      aria-label={product ? "Edit product" : "New product"}
      className="grid gap-8"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!input) return focusFirstInvalid(e.currentTarget);
        if (product) update.mutate({ id: product.id, patch: input });
        else create.mutate(input);
      }}
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="heading mb-4">Details</legend>
        <Field label="Name" htmlFor="product-name" error={shown.name}>
          <Input
            {...text("name", "product-name")}
            onChange={(e) => {
              const name = e.target.value;
              setForm((f) => ({ ...f, name, slug: slugEdited ? f.slug : slugify(name) }));
            }}
          />
        </Field>
        <Field label="Slug" htmlFor="product-slug" error={shown.slug} hint={`Shop address: /product/${form.slug || "…"}`}>
          <Input
            {...text("slug", "product-slug")}
            onChange={(e) => {
              setSlugEdited(true);
              set("slug", e.target.value.toLowerCase());
            }}
          />
        </Field>
        <Field label="Kind" htmlFor="product-kind" error={shown.kind}>
          <Input {...text("kind", "product-kind")} placeholder="Three-seat sofa" />
        </Field>
        <Field label="Category" htmlFor="product-category" error={shown.categoryId}>
          <Select value={form.categoryId || undefined} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger id="product-category" className="h-[50px] rounded-[12px]" aria-invalid={Boolean(shown.categoryId)}>
              <SelectValue placeholder={catalog.categories.length ? "Choose a category" : "Categories unavailable"} />
            </SelectTrigger>
            <SelectContent align="start">
              {catalog.categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Price (€, VAT included)" htmlFor="product-price" error={shown.price} hint={parseEuros(form.price) ? money(parseEuros(form.price)!) : undefined}>
          <Input {...text("price", "product-price")} inputMode="decimal" />
        </Field>
        <div className="grid content-end gap-3 pb-1 sm:pb-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="product-featured" className="cursor-pointer">
              Featured on the home page
            </Label>
            <Switch id="product-featured" checked={form.featured} onCheckedChange={(v) => set("featured", v)} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="product-soldout" className="mb-0 cursor-pointer">
              Marked sold out
            </Label>
            <Switch id="product-soldout" checked={form.soldOut} onCheckedChange={(v) => set("soldOut", v)} />
          </div>
        </div>
        <Field label="Story" htmlFor="product-story" error={shown.story} className="sm:col-span-2">
          <Textarea {...text("story", "product-story")} rows={4} />
        </Field>
      </fieldset>

      <fieldset>
        <legend className="heading mb-4">Materials</legend>
        {catalog.materials.length ? (
          <div className="flex flex-wrap gap-2">
            {catalog.materials.map((m) => {
              const on = form.materials.includes(m.id);
              return (
                <label key={m.id} className="chip gap-2" data-checked={on}>
                  <Checkbox checked={on} onCheckedChange={(v) => set("materials", v ? [...form.materials, m.id] : form.materials.filter((x) => x !== m.id))} />
                  {m.label}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-stone">Materials are unavailable while the catalog snapshot can’t be loaded.</p>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="heading mb-4">Images</legend>
        <Field label="Hero image URL" htmlFor="product-hero" error={shown.heroImageUrl} hint="A site path such as /products/holt-sofa.jpg, or an uploaded image’s URL.">
          <Input {...text("heroImageUrl", "product-hero")} />
        </Field>
        <Field label="Detail image URL (optional)" htmlFor="product-detail" error={shown.detailImageUrl}>
          <Input {...text("detailImageUrl", "product-detail")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="heading mb-4">Dimensions and care</legend>
        <Field label="Width (cm)" htmlFor="product-width" error={shown.widthCm}>
          <Input {...text("widthCm", "product-width")} inputMode="decimal" />
        </Field>
        <Field label="Depth (cm)" htmlFor="product-depth" error={shown.depthCm}>
          <Input {...text("depthCm", "product-depth")} inputMode="decimal" />
        </Field>
        <Field label="Height (cm)" htmlFor="product-height" error={shown.heightCm}>
          <Input {...text("heightCm", "product-height")} inputMode="decimal" />
        </Field>
        <Field label="Weight (kg)" htmlFor="product-weight" error={shown.weightKg}>
          <Input {...text("weightKg", "product-weight")} inputMode="decimal" />
        </Field>
        <Field label="Construction" htmlFor="product-construction" className="sm:col-span-2">
          <Textarea {...text("construction", "product-construction")} rows={3} className="!min-h-20" />
        </Field>
        <Field label="Care" htmlFor="product-care" className="sm:col-span-2">
          <Textarea {...text("care", "product-care")} rows={3} className="!min-h-20" />
        </Field>
      </fieldset>

      <ErrorState error={create.error ?? update.error} what="The product was not saved" />
      {touched && !input ? (
        <p className="text-sm text-brick" role="alert">
          Fix the highlighted fields to save.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={saving}>
          {product ? "Save product" : "Create draft"}
        </Button>
        <Link href="/admin/products" className="btn btn-quiet">
          Cancel
        </Link>
      </div>
    </form>
  );
}

type VariantRow = VariantInput & { key: string };

function VariantsEditor({ product }: { product: ProductDto }) {
  const utils = trpc.useUtils();
  const catalog = useCatalog();
  const counter = useRef(0);
  const [rows, setRows] = useState<VariantRow[]>(() => product.variants.map((v) => ({ id: v.id, sku: v.sku, label: v.label, colorFamily: v.colorFamily, material: v.material, swatchUrl: v.swatchUrl, imageUrl: v.imageUrl, key: v.id })));
  const [touched, setTouched] = useState(false);
  const save = trpc.admin.products.replaceVariants.useMutation({
    onSuccess: (saved) => {
      toast.success(`Saved ${saved.variants.length} ${saved.variants.length === 1 ? "variant" : "variants"}`);
      utils.admin.products.byId.setData({ id: saved.id }, saved);
      void utils.admin.products.list.invalidate();
    },
  });
  const materials = catalog.materials.length ? catalog.materials : product.materials.map((id) => ({ id, label: id, swatchUrl: "" }));

  const update = (key: string, patch: Partial<VariantInput>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    counter.current += 1;
    const n = rows.length + 1;
    const key = `new-${Date.now().toString(36)}-${counter.current}`;
    setRows((rs) => [
      ...rs,
      {
        key,
        id: `${product.slug.slice(0, 30)}-v${n}`,
        sku: `${product.slug.toUpperCase().slice(0, 32)}-${n}`,
        label: "",
        colorFamily: "neutral",
        material: product.materials[0] ?? materials[0]?.id ?? "",
        swatchUrl: product.heroImageUrl,
        imageUrl: product.heroImageUrl,
      },
    ]);
  };

  const problems = rows.map((r) => {
    const errs: string[] = [];
    if (!r.label.trim()) errs.push("label");
    if (!r.sku.trim()) errs.push("SKU");
    if (!r.id.trim()) errs.push("id");
    if (!r.material) errs.push("material");
    if (!/^(\/\S*|https?:\/\/\S+)$/.test(r.swatchUrl) || !/^(\/\S*|https?:\/\/\S+)$/.test(r.imageUrl)) errs.push("image URLs");
    return errs;
  });
  const dupSku = new Set(rows.map((r) => r.sku.trim())).size !== rows.length;
  const dupId = new Set(rows.map((r) => r.id.trim())).size !== rows.length;
  const invalid = !rows.length || problems.some((p) => p.length) || dupSku || dupId;

  return (
    <div className="grid gap-4">
      {rows.length ? null : <p className="text-stone">No variants yet. A product needs at least one variant before it can be published.</p>}
      {rows.map((r, i) => (
        <fieldset key={r.key} className="grid gap-3 rounded-[16px] border border-line p-4 sm:grid-cols-2 xl:grid-cols-3">
          <legend className="px-1 text-sm font-medium">Variant {i + 1}</legend>
          <Field label="Label" htmlFor={`${r.key}-label`} error={touched && !r.label.trim() ? "Enter a finish label." : null}>
            <Input id={`${r.key}-label`} className="!min-h-11" placeholder="Oat wool" value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} aria-invalid={touched && !r.label.trim()} />
          </Field>
          <Field label="SKU" htmlFor={`${r.key}-sku`} error={touched && !r.sku.trim() ? "Enter a SKU." : null}>
            <Input id={`${r.key}-sku`} className="!min-h-11 tabular" value={r.sku} onChange={(e) => update(r.key, { sku: e.target.value.toUpperCase() })} aria-invalid={touched && !r.sku.trim()} />
          </Field>
          <Field label="Variant id" htmlFor={`${r.key}-id`}>
            <Input id={`${r.key}-id`} className="!min-h-11" value={r.id} onChange={(e) => update(r.key, { id: e.target.value })} />
          </Field>
          <Field label="Colour family" htmlFor={`${r.key}-colour`}>
            <Select value={r.colorFamily} onValueChange={(v) => update(r.key, { colorFamily: v as ColorFamily })}>
              <SelectTrigger id={`${r.key}-colour`} className="h-11 rounded-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {COLOR_FAMILIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {colourLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Material" htmlFor={`${r.key}-material`}>
            <Select value={r.material || undefined} onValueChange={(v) => update(r.key, { material: v })}>
              <SelectTrigger id={`${r.key}-material`} className="h-11 rounded-[12px]">
                <SelectValue placeholder="Choose a material" />
              </SelectTrigger>
              <SelectContent align="start">
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end justify-end">
            <Button type="button" variant="quiet" size="sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove variant ${i + 1}`}>
              Remove
            </Button>
          </div>
          <Field label="Swatch image URL" htmlFor={`${r.key}-swatch`} className="xl:col-span-3 sm:col-span-2">
            <Input id={`${r.key}-swatch`} className="!min-h-11" value={r.swatchUrl} onChange={(e) => update(r.key, { swatchUrl: e.target.value })} />
          </Field>
          <Field label="Finish photo URL" htmlFor={`${r.key}-image`} className="xl:col-span-3 sm:col-span-2">
            <Input id={`${r.key}-image`} className="!min-h-11" value={r.imageUrl} onChange={(e) => update(r.key, { imageUrl: e.target.value })} />
          </Field>
        </fieldset>
      ))}
      {touched && (dupSku || dupId) ? (
        <p className="text-sm text-brick" role="alert">
          Each variant needs its own SKU and id.
        </p>
      ) : null}
      {touched && invalid && !dupSku && !dupId ? (
        <p className="text-sm text-brick" role="alert">
          {rows.length ? "Complete every variant before saving." : "Add at least one variant."}
        </p>
      ) : null}
      <ErrorState error={save.error} what="Variants were not saved" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          <Icon name="plus" size={16} />
          Add variant
        </Button>
        <Button
          type="button"
          size="sm"
          pending={save.isPending}
          onClick={() => {
            setTouched(true);
            if (invalid) return;
            save.mutate({ id: product.id, variants: rows.map((v) => ({ id: v.id.trim(), sku: v.sku.trim(), label: v.label.trim(), colorFamily: v.colorFamily, material: v.material, swatchUrl: v.swatchUrl, imageUrl: v.imageUrl })) });
          }}
        >
          Save variants
        </Button>
      </div>
    </div>
  );
}

function ImagesPanel({ product }: { product: ProductDto }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [altError, setAltError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async ({ file: chosen, alt: text }: { file: File; alt: string }) => {
      setStep("Requesting an upload link");
      const ticket = await utils.client.admin.products.uploadUrl.mutate({ id: product.id, contentType: chosen.type as (typeof IMAGE_TYPES)[number], fileName: chosen.name });
      setStep("Uploading to storage");
      const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "content-type": chosen.type }, body: chosen, signal: AbortSignal.timeout(60_000) }).catch(() => null);
      if (!put?.ok) throw new Error(`Storage refused the upload${put ? ` (HTTP ${put.status})` : ""}. The link may have expired; try again.`);
      setStep("Attaching to the product");
      return utils.client.admin.products.attachImage.mutate({ id: product.id, objectKey: ticket.objectKey, alt: text });
    },
    onSuccess: () => {
      toast.success("Image uploaded and attached");
      setFile(null);
      setAlt("");
      if (fileRef.current) fileRef.current.value = "";
      void utils.admin.products.byId.invalidate({ id: product.id });
    },
    onSettled: () => setStep(null),
  });
  const remove = trpc.admin.products.removeImage.useMutation({
    onSuccess: () => {
      toast.success("Image removed");
      void utils.admin.products.byId.invalidate({ id: product.id });
    },
  });
  const hero = trpc.admin.products.update.useMutation({
    onSuccess: (saved) => {
      toast.success("Hero image updated");
      utils.admin.products.byId.setData({ id: saved.id }, saved);
    },
  });
  const images = [...product.images].sort((a, b) => a.position - b.position);

  return (
    <div className="grid gap-5">
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Product images">
          {images.map((img) => (
            <li key={img.id} className="grid gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded media is served from the media bucket */}
              <img src={img.url} alt={img.alt} className="aspect-[4/5] w-full rounded-[18px] bg-plaster object-cover" />
              <p className="truncate text-sm text-stone" title={img.alt}>
                {img.alt}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="quiet" size="sm" className="!min-h-8 !px-3" pending={remove.isPending && remove.variables?.imageId === img.id} onClick={() => remove.mutate({ id: product.id, imageId: img.id })} aria-label={`Remove image ${img.alt}`}>
                  Remove
                </Button>
                {product.heroImageUrl !== img.url ? (
                  <Button variant="secondary" size="sm" className="!min-h-8 !px-3" pending={hero.isPending} onClick={() => hero.mutate({ id: product.id, patch: { heroImageUrl: img.url } })} aria-label={`Use ${img.alt} as hero image`}>
                    Use as hero
                  </Button>
                ) : (
                  <span className="status status-muted">Hero</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-stone">No uploaded images yet.</p>
      )}
      <ErrorState error={remove.error ?? hero.error} />

      <form
        aria-label="Upload image"
        className="grid gap-4 rounded-[16px] border border-line p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) {
            setFileError("Choose a JPEG, PNG or WebP image.");
            return focusFirstInvalid(e.currentTarget);
          }
          if (!alt.trim()) {
            setAltError("Describe the image for screen readers.");
            return focusFirstInvalid(e.currentTarget);
          }
          setFileError(null);
          upload.mutate({ file, alt: alt.trim() });
        }}
      >
        <Field label="Image file" htmlFor="image-file" hint="JPEG, PNG or WebP up to 8 MB." error={fileError}>
          <input
            ref={fileRef}
            id="image-file"
            type="file"
            accept={IMAGE_TYPES.join(",")}
            aria-invalid={Boolean(fileError)}
            className="field h-[50px] cursor-pointer py-[7px] text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-plaster file:px-3 file:py-1.5 file:text-ink"
            onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null;
              if (chosen && !IMAGE_TYPES.includes(chosen.type as (typeof IMAGE_TYPES)[number])) {
                setFile(null);
                setFileError("That file type isn’t supported. Use JPEG, PNG or WebP.");
              } else if (chosen && chosen.size > MAX_IMAGE_BYTES) {
                setFile(null);
                setFileError("That image is larger than 8 MB.");
              } else {
                setFile(chosen);
                setFileError(null);
                if (chosen && !alt) {
                  setAlt(product.name);
                  setAltError(null);
                }
              }
            }}
          />
        </Field>
        <Field label="Alt text" htmlFor="image-alt" error={altError}>
          <Input
            id="image-alt"
            value={alt}
            aria-invalid={Boolean(altError)}
            onChange={(e) => {
              setAlt(e.target.value);
              setAltError(null);
            }}
          />
        </Field>
        {/* Tops align across the row; the button drops by one label row (36px) so it sits centred on the inputs. */}
        <Button type="submit" pending={upload.isPending} className="sm:mt-9">
          Upload image
        </Button>
        {step ? (
          <p className="text-sm text-stone sm:col-span-3" role="status">
            {step}…
          </p>
        ) : null}
        <ErrorState className="sm:col-span-3" error={upload.error} what="Upload failed" />
      </form>
    </div>
  );
}

function StatusPanel({ product }: { product: ProductDto }) {
  const utils = trpc.useUtils();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const onSaved = (saved: ProductDto, message: string) => {
    toast.success(message);
    utils.admin.products.byId.setData({ id: saved.id }, saved);
    void utils.admin.products.list.invalidate();
  };
  const publish = trpc.admin.products.publish.useMutation({ onSuccess: (saved) => onSaved(saved, `“${saved.name}” is published`) });
  const archive = trpc.admin.products.archive.useMutation({
    onSuccess: (saved) => {
      setConfirmArchive(false);
      onSaved(saved, `“${saved.name}” is archived`);
    },
  });

  return (
    <section aria-labelledby="product-status-title" className="panel p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="product-status-title" className="heading">
          Status
        </h2>
        <ProductStatusChip status={product.status} />
      </div>
      <p className="mt-3 text-sm text-stone">
        {product.status === "published"
          ? "Visible in the shop and search."
          : product.status === "draft"
            ? product.variants.length
              ? "Not visible to shoppers yet."
              : "Add at least one variant to publish."
            : "Hidden from the shop. Publish again to restore it."}
      </p>
      <ErrorState className="mt-4" error={publish.error ?? archive.error} what="Status change refused" />
      <div className="mt-5 flex flex-wrap gap-2">
        {product.status !== "published" ? (
          <Button size="sm" pending={publish.isPending} onClick={() => publish.mutate({ id: product.id })}>
            Publish
          </Button>
        ) : (
          <Link href={`/product/${product.slug}`} className="btn btn-secondary btn-sm">
            View in shop
          </Link>
        )}
        {product.status !== "archived" ? (
          <Button variant="quiet" size="sm" onClick={() => setConfirmArchive(true)}>
            Archive
          </Button>
        ) : null}
      </div>
      <Dialog open={confirmArchive} onOpenChange={(open) => !archive.isPending && setConfirmArchive(open)}>
        <DialogContent className="p-6">
          <DialogTitle>Archive “{product.name}”?</DialogTitle>
          <DialogDescription className="mt-2">It disappears from the shop and search (ProductArchived). Orders that include it are unaffected.</DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="sm" onClick={() => setConfirmArchive(false)} disabled={archive.isPending}>
              Cancel
            </Button>
            <Button size="sm" pending={archive.isPending} onClick={() => archive.mutate({ id: product.id })}>
              Archive product
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function NewProduct() {
  return (
    <div>
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-ink">
        <Icon name="arrowLeft" size={16} />
        All products
      </Link>
      <h1 className="section-title mt-3">New product</h1>
      <p className="mt-2 text-stone">Products start as drafts. Add variants and images after creating it, then publish.</p>
      <div className="mt-8 max-w-4xl">
        <ProductForm />
      </div>
    </div>
  );
}

export function EditProduct({ id }: { id: string }) {
  const product = trpc.admin.products.byId.useQuery({ id });

  if (product.isPending) {
    return (
      <div aria-busy="true" className="grid gap-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!product.data) {
    return (
      <div>
        <Link href="/admin/products" className="link text-sm">
          All products
        </Link>
        <h1 className="section-title mt-3">Product</h1>
        {product.error?.data?.code === "NOT_FOUND" ? <EmptyState className="mt-6" title="Product not found" /> : <ErrorState className="mt-6" error={product.error} what="The product could not be loaded" />}
      </div>
    );
  }
  const p = product.data;

  return (
    <div>
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-ink">
        <Icon name="arrowLeft" size={16} />
        All products
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="section-title">{p.name}</h1>
        <ProductStatusChip status={p.status} />
      </div>
      <div className="mt-8 grid gap-10 xl:grid-cols-12">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-12 xl:col-span-8">
          <ProductForm key={`${p.id}-${p.heroImageUrl}`} product={p} />
          <Section title="Variants" id="variants-title">
            <VariantsEditor key={`${p.id}-${p.variants.map((v) => v.sku).join()}`} product={p} />
          </Section>
          <Section title="Gallery images" id="images-title">
            <ImagesPanel product={p} />
          </Section>
        </div>
        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6 xl:col-span-4">
          <StatusPanel product={p} />
          <div className="panel p-6">
            <h2 className="heading">Preview</h2>
            {/* eslint-disable-next-line @next/next/no-img-element -- hero may be an uploaded media URL */}
            <img src={p.heroImageUrl} alt="" className="mt-4 aspect-[4/5] w-full rounded-[18px] bg-plaster-deep object-cover" />
            <p className="mt-3 font-medium">{p.name}</p>
            <p className="text-sm text-stone">
              {p.kind} · <span className="tabular">{money(p.priceCents)}</span>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
