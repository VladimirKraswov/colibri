#!/usr/bin/env bash
set -euo pipefail

node_version=v22.23.1
node_archive="node-${node_version}-linux-x64.tar.xz"
node_base="https://nodejs.org/dist/${node_version}"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl xz-utils postgresql postgresql-contrib openssl

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(`.`)[0]')" -lt 22 ]]; then
  runtime_tmp="$(mktemp -d)"
  trap 'rm -rf -- "$runtime_tmp"' EXIT
  curl -fsSLo "$runtime_tmp/$node_archive" "$node_base/$node_archive"
  curl -fsSLo "$runtime_tmp/SHASUMS256.txt" "$node_base/SHASUMS256.txt"
  (cd "$runtime_tmp" && grep "  $node_archive\$" SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$runtime_tmp/$node_archive" -C /usr/local --strip-components=1
fi

systemctl enable --now postgresql
id colibri-studio >/dev/null 2>&1 || useradd --system --home /var/lib/colibri-studio --shell /usr/sbin/nologin colibri-studio
install -d -o colibri-studio -g colibri-studio -m 0750 /var/lib/colibri-studio
install -d -o root -g colibri-studio -m 0750 /etc/colibri-studio

db_password="$(openssl rand -hex 24)"
runuser -u postgres -- psql --set ON_ERROR_STOP=1 --set db_password="$db_password" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'colibri_studio') THEN
    CREATE ROLE colibri_studio LOGIN;
  END IF;
END $$;
SELECT format('ALTER ROLE colibri_studio PASSWORD %L', :'db_password') \gexec
SELECT 'CREATE DATABASE colibri_studio OWNER colibri_studio'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'colibri_studio') \gexec
SQL

if [[ ! -r /root/colibri-studio-s3.env ]]; then
  echo "/root/colibri-studio-s3.env is required; provision MinIO first" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source /root/colibri-studio-s3.env
set +a
: "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}"

umask 027
cat > /etc/colibri-studio/studio.env <<EOF
NODE_ENV=production
STUDIO_HOST=127.0.0.1
STUDIO_PORT=3000
STUDIO_PUBLIC_ORIGIN=https://192.168.31.59:8443
STUDIO_DEFAULT_WORKSPACE=local
STUDIO_DATA_DIR=/var/lib/colibri-studio
STUDIO_WEB_ROOT=/opt/colibri-studio/apps/web/dist
DATABASE_URL=postgresql://colibri_studio:${db_password}@127.0.0.1:5432/colibri_studio
DATABASE_POOL_MAX=12
S3_ENDPOINT=http://192.168.31.245:9000
S3_REGION=us-east-1
S3_BUCKET=colibri-studio
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
S3_FORCE_PATH_STYLE=true
GEMMA_BASE_URL=http://127.0.0.1:18080
QWEN_BASE_URL=http://127.0.0.1:8081
ASR_BASE_URL=http://127.0.0.1:18081
LOG_LEVEL=info
EOF
chown root:colibri-studio /etc/colibri-studio/studio.env
chmod 0640 /etc/colibri-studio/studio.env
rm -f -- /root/colibri-studio-s3.env

node --version
psql --version
