import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createBreaker, envInt, injectChaos, type KitBreaker, onShutdown } from "@meridian/nest-kit";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { MediaStorage, type StoredObject, type UploadUrl } from "../../application/ports/media-storage";

export const S3_TIMEOUT_MS = 5000;
export const S3_BREAKER = "s3";
export const S3_CHAOS_TARGET = "s3.put";

export interface S3Settings {
  endpoint: string;
  /** Host that browsers reach, used only to sign upload URLs (defaults to `endpoint`). */
  presignEndpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
  timeoutMs: number;
}

export function s3SettingsFromEnv(env: NodeJS.ProcessEnv = process.env): S3Settings {
  const endpoint = (env.S3_ENDPOINT || "http://localhost:9000").replace(/\/+$/, "");
  const bucket = env.S3_BUCKET_MEDIA || "meridian-media";
  return {
    endpoint,
    presignEndpoint: (env.S3_PRESIGN_ENDPOINT || endpoint).replace(/\/+$/, ""),
    region: env.S3_REGION || "us-east-1",
    accessKeyId: env.S3_ACCESS_KEY || "meridian",
    secretAccessKey: env.S3_SECRET_KEY || "meridianminio",
    bucket,
    publicUrl: (env.S3_PUBLIC_URL || `${endpoint}/${bucket}`).replace(/\/+$/, ""),
    timeoutMs: envInt("S3_TIMEOUT_MS", S3_TIMEOUT_MS, { min: 100 }),
  };
}

type Operation<T> = (signal: AbortSignal) => Promise<T>;

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

/**
 * MinIO/S3 adapter (path-style). Every call runs through the "s3" circuit breaker with a 5 s budget enforced three
 * ways: the breaker timeout, an abort signal on the SDK request, and connection/request timeouts on the HTTP handler.
 * Write paths (upload tickets, deletes) are chaos injection point "s3.put".
 */
@Injectable()
export class S3MediaStorage extends MediaStorage implements OnModuleInit {
  private readonly settings = s3SettingsFromEnv();
  private readonly client = new S3Client({
    endpoint: this.settings.endpoint,
    region: this.settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: this.settings.accessKeyId, secretAccessKey: this.settings.secretAccessKey },
    maxAttempts: 1,
    requestHandler: { connectionTimeout: Math.min(2000, this.settings.timeoutMs), requestTimeout: this.settings.timeoutMs },
    // Presigned PUTs must not carry SDK-computed checksums the browser upload cannot reproduce.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  /** Signs browser upload URLs against the host browsers reach (the signature covers the host); never sends requests. */
  private readonly signer = new S3Client({
    endpoint: this.settings.presignEndpoint,
    region: this.settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: this.settings.accessKeyId, secretAccessKey: this.settings.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  private readonly breaker: KitBreaker<[Operation<unknown>], unknown> = createBreaker(S3_BREAKER, S3_BREAKER, (op: Operation<unknown>) => op(AbortSignal.timeout(this.settings.timeoutMs)), {
    timeoutMs: this.settings.timeoutMs,
  });

  onModuleInit(): void {
    // Keep-alive sockets would otherwise hold the event loop open after the graceful shutdown sequence.
    onShutdown("s3-client", "resources", () => {
      this.client.destroy();
      this.signer.destroy();
    });
  }

  private run<T>(op: Operation<T>): Promise<T> {
    return this.breaker.fire(op as Operation<unknown>) as Promise<T>;
  }

  async createUploadUrl(objectKey: string, contentType: string, expiresInSec: number): Promise<UploadUrl> {
    return this.run(async () => {
      await injectChaos(S3_CHAOS_TARGET);
      const command = new PutObjectCommand({ Bucket: this.settings.bucket, Key: objectKey, ContentType: contentType });
      const uploadUrl = await getSignedUrl(this.signer, command, { expiresIn: expiresInSec, signableHeaders: new Set(["content-type"]) });
      return { uploadUrl, expiresAt: new Date(Date.now() + expiresInSec * 1000) };
    });
  }

  async stat(objectKey: string): Promise<StoredObject | null> {
    return this.run(async (abortSignal) => {
      try {
        const head = await this.client.send(new HeadObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }), { abortSignal });
        return { contentType: head.ContentType ?? null, sizeBytes: head.ContentLength ?? 0 };
      } catch (error) {
        // A missing object is an answer, not a dependency failure: it must not trip the breaker.
        if (isNotFound(error)) return null;
        throw error;
      }
    });
  }

  async delete(objectKey: string): Promise<void> {
    await this.run(async (abortSignal) => {
      await injectChaos(S3_CHAOS_TARGET);
      await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }), { abortSignal });
    });
  }

  publicUrl(objectKey: string): string {
    return `${this.settings.publicUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  }
}
