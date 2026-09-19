import { describe, expect, it } from "vitest";
import { invoiceBucketSettingsFromEnv, S3InvoiceStorage } from "./s3-invoice-storage";

describe("S3InvoiceStorage", () => {
  it("invoice bucket settings come from the S3 environment with the private invoices bucket", () => {
    expect(invoiceBucketSettingsFromEnv({ S3_ENDPOINT: "http://minio:9000/", S3_BUCKET_INVOICES: "inv" } as NodeJS.ProcessEnv)).toMatchObject({ endpoint: "http://minio:9000", bucket: "inv", timeoutMs: 5000 });
  });

  it("invoice download link is a presigned GET for the object that expires", async () => {
    process.env.S3_BUCKET_INVOICES = "meridian-invoices";
    const storage = new S3InvoiceStorage();
    const before = Date.now();
    const link = await storage.downloadUrl("invoices/2026/INV-2026-000001.pdf", 300);
    const url = new URL(link.url);
    expect(url.pathname).toBe("/meridian-invoices/invoices/2026/INV-2026-000001.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(link.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000);
  });
});
