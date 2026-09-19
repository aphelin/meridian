export interface UploadUrl {
  uploadUrl: string;
  expiresAt: Date;
}

export interface StoredObject {
  contentType: string | null;
  sizeBytes: number;
}

/** Object storage for product media (MinIO/S3). Every call is bounded by a timeout and a circuit breaker. */
export abstract class MediaStorage {
  /** Presigned PUT URL for `objectKey`, restricted to `contentType`. */
  abstract createUploadUrl(objectKey: string, contentType: string, expiresInSec: number): Promise<UploadUrl>;
  /** Object metadata, or null when the object does not exist. */
  abstract stat(objectKey: string): Promise<StoredObject | null>;
  abstract delete(objectKey: string): Promise<void>;
  abstract publicUrl(objectKey: string): string;
}
