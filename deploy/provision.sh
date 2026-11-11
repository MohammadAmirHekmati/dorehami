#!/usr/bin/env bash
set -euo pipefail
db_container=portfolio-platform-postgres-1
env_file=/opt/dorehami/shared/app.env
install -d -m 700 /opt/dorehami/shared
if [ -e "$env_file" ]; then
  echo 'Existing application environment retained.'
  exit 0
fi
exists=$(docker exec "$db_container" sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname = '\''dorehami'\''; SELECT count(*) FROM pg_roles WHERE rolname = '\''dorehami_app'\'';"')
if [ "$exists" != $'0\n0' ]; then echo 'Dedicated database or role already exists; refusing to overwrite.' >&2; exit 1; fi
password=$(openssl rand -hex 32)
{
  printf "CREATE ROLE dorehami_app LOGIN PASSWORD '%s' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 5;\n" "$password"
  printf 'CREATE DATABASE dorehami OWNER dorehami_app;\n'
  printf 'REVOKE ALL ON DATABASE dorehami FROM PUBLIC;\nGRANT CONNECT,TEMPORARY ON DATABASE dorehami TO dorehami_app;\n'
} | docker exec -i "$db_container" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres'
umask 077
{
  printf 'NODE_ENV=production\nHOST=127.0.0.1\nPORT=3036\nTRUST_PROXY=1\nAPP_ORIGIN=https://dorehami.saeedghofrani.xyz\nNODE_OPTIONS=--max-old-space-size=128\n'
  printf 'DATABASE_URL=postgresql://dorehami_app:%s@127.0.0.1:5432/dorehami\n' "$password"
} > "$env_file"
unset password
echo 'Created isolated database and protected environment file.'
