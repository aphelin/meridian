import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createBreaker, envInt, type KitBreaker, onShutdown } from "@meridian/nest-kit";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { InvoiceStorage } from "../../application/ports";

export const S3_TIMEOUT_MS = 5000;
export const S3_BREAKER = "s3";
export const S3_PUT_CHAOS_TARGET = "s3.put";
/**
 * Invoice uploads are background, low-volume work that the queue already retries (and dead-letters). The breaker should
 * open on a sustained storage outage, not because one message used up its few attempts, so it needs 10 calls in the
 * rolling window before the error rate counts.
 */
export const S3_BREAKER_VOLUME_THRESHOLD = 10;

export interface InvoiceBucketSettings {
  endpoint: string;
  /** Host that browsers reach, used only to sign download links (defaults to `endpoint`). */
  presignEndpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  timeoutMs: number;
}

export function invoiceBucketSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): InvoiceBucketSettings {
  return {
    endpoint: (env.S3_ENDPOINT || "http://localhost:9000").replace(/\/+$/, ""),
    presignEndpoint: (env.S3_PRESIGN_ENDPOINT || env.S3_ENDPOINT || "http://localhost:9000").replace(/\/+$/, ""),
    region: env.S3_REGION || "us-east-1",
    accessKeyId: env.S3_ACCESS_KEY || "meridian",
    secretAccessKey: env.S3_SECRET_KEY || "meridianminio",
    bucket: env.S3_BUCKET_INVOICES || "meridian-invoices",
    timeoutMs: envInt("S3_TIMEOUT_MS", S3_TIMEOUT_MS, { min: 100, max: 60_000 }),
  };
}

type Put = { key: string; body: Uint8Array; contentType: string };

/**
 * Private MinIO/S3 bucket for invoice PDFs (path-style). Uploads run through the "s3" circuit breaker (chaos target
 * `s3.put`) with the timeout enforced by the breaker, an abort signal on the request and the HTTP handler timeouts.
 * Downloads are presigned GET links computed locally (no network call).
 */
@Injectable()
export class S3InvoiceStorage extends InvoiceStorage implements OnModuleInit {
  private readonly settings = invoiceBucketSettingsFromEnv();
  private readonly client = new S3Client({
    endpoint: this.settings.endpoint,
    region: this.settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: this.settings.accessKeyId, secretAccessKey: this.settings.secretAccessKey },
    maxAttempts: 1,
    requestHandler: { connectionTimeout: Math.min(2000, this.settings.timeoutMs), requestTimeout: this.settings.timeoutMs },
  });
  /**
   * A presigned URL's signature covers its host, so links for browsers are signed against the host browsers can reach
   * (in Docker the service talks to `minio:9000`, browsers to `localhost:9000`). Signing is local: this client never
   * sends a request.
   */
  private readonly signer = new S3Client({
    endpoint: this.settings.presignEndpoint,
    region: this.settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: this.settings.accessKeyId, secretAccessKey: this.settings.secretAccessKey },
  });
  private readonly putBreaker: KitBreaker<[Put], void> = createBreaker(
    S3_BREAKER,
    S3_PUT_CHAOS_TARGET,
    async (put: Put) => {
      await this.client.send(new PutObjectCommand({ Bucket: this.settings.bucket, Key: put.key, Body: put.body, ContentType: put.contentType }), {
        abortSignal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    },
    { timeoutMs: this.settings.timeoutMs, volumeThreshold: S3_BREAKER_VOLUME_THRESHOLD },
  );

  onModuleInit(): void {
    // Keep-alive sockets would otherwise hold the event loop open after the graceful shutdown sequence.
    onShutdown("s3-invoices-client", "resources", () => {
      this.client.destroy();
      this.signer.destroy();
    });
  }

  async put(objectKey: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.putBreaker.fire({ key: objectKey, body, contentType });
  }

  async downloadUrl(objectKey: string, expiresInSec: number): Promise<{ url: string; expiresAt: Date }> {
    const fileName = objectKey.split("/").at(-1) ?? "invoice.pdf";
    const command = new GetObjectCommand({ Bucket: this.settings.bucket, Key: objectKey, ResponseContentDisposition: `attachment; filename="${fileName}"`, ResponseContentType: "application/pdf" });
    const url = await getSignedUrl(this.signer, command, { expiresIn: expiresInSec });
    return { url, expiresAt: new Date(Date.now() + expiresInSec * 1000) };
  }
}
