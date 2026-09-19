#!/bin/sh
# One-shot: apply init-schemas.sql to the running database (the entrypoint copy only runs on an empty volume).
set -eu

export PGHOST="${PGHOST:-postgres}" PGPORT="${PGPORT:-5432}"
ATTEMPTS="${INIT_ATTEMPTS:-60}"

echo "postgres-init: waiting for ${PGHOST}:${PGPORT}"
i=1
until pg_isready -q && psql -Atqc 'select 1' >/dev/null 2>&1; do
  if [ "$i" -ge "$ATTEMPTS" ]; then
    echo "postgres-init: Postgres did not answer after ${ATTEMPTS} attempts" >&2
    exit 1
  fi
  i=$((i + 1))
  sleep 2
done

psql -v ON_ERROR_STOP=1 -q -f /init/init-schemas.sql
echo "postgres-init: schemas: $(psql -Atc "select string_agg(nspname, ',' order by nspname) from pg_namespace where nspname in ('identity','catalog','inventory','checkout','payment','notification','search','analytics')")"
echo "postgres-init: done"
