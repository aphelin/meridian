#!/bin/sh
# One-shot: media bucket (anonymous download, product images) and invoices bucket (private, presigned GETs only).
# Idempotent: mc mb --ignore-existing and anonymous policies are declarative.
set -eu

ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
MEDIA="${S3_BUCKET_MEDIA:-meridian-media}"
INVOICES="${S3_BUCKET_INVOICES:-meridian-invoices}"
ATTEMPTS="${INIT_ATTEMPTS:-60}"

echo "minio-init: waiting for ${ENDPOINT}"
i=1
until mc alias set local "$ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 && mc ready local >/dev/null 2>&1; do
  if [ "$i" -ge "$ATTEMPTS" ]; then
    echo "minio-init: MinIO did not answer after ${ATTEMPTS} attempts" >&2
    exit 1
  fi
  i=$((i + 1))
  sleep 2
done

mc mb --ignore-existing "local/${MEDIA}"
mc anonymous set download "local/${MEDIA}"
mc mb --ignore-existing "local/${INVOICES}"
mc anonymous set none "local/${INVOICES}"
echo "minio-init: done (${MEDIA} public-read, ${INVOICES} private)"
