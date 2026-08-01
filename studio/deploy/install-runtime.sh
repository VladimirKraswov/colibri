#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/local/bin:${PATH}"
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

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
id ai-control-center >/dev/null 2>&1 || useradd --system --home /var/lib/ai-control-center --shell /usr/sbin/nologin ai-control-center
install -d -o ai-control-center -g ai-control-center -m 0750 /var/lib/ai-control-center
install -d -o root -g ai-control-center -m 0750 /etc/ai-control-center

db_password="$(openssl rand -hex 24)"
runuser -u postgres -- psql --set ON_ERROR_STOP=1 --set db_password="$db_password" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ai_control_center') THEN
    CREATE ROLE ai_control_center LOGIN;
  END IF;
END $$;
SELECT format('ALTER ROLE ai_control_center PASSWORD %L', :'db_password') \gexec
SELECT 'CREATE DATABASE ai_control_center OWNER ai_control_center'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ai_control_center') \gexec
SQL

if [[ ! -r /root/ai-control-center-s3.env ]]; then
  echo "/root/ai-control-center-s3.env is required; provision MinIO first" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source /root/ai-control-center-s3.env
set +a
: "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}"

umask 027
cat > /etc/ai-control-center/center.env <<EOF
NODE_ENV=production
AI_CONTROL_CENTER_HOST=127.0.0.1
AI_CONTROL_CENTER_PORT=3000
AI_CONTROL_CENTER_PUBLIC_ORIGIN=https://192.168.31.59:8443
AI_CONTROL_CENTER_DEFAULT_WORKSPACE=local
AI_CONTROL_CENTER_DATA_DIR=/var/lib/ai-control-center
AI_CONTROL_CENTER_WEB_ROOT=/opt/ai-control-center/apps/web/dist
DATABASE_URL=postgresql://ai_control_center:${db_password}@127.0.0.1:5432/ai_control_center
DATABASE_POOL_MAX=12
S3_ENDPOINT=http://192.168.31.245:9000
S3_REGION=us-east-1
S3_BUCKET=ai-control-center
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
S3_FORCE_PATH_STYLE=true
GEMMA_BASE_URL=http://127.0.0.1:18080
QWEN_BASE_URL=http://127.0.0.1:8081
ASR_BASE_URL=http://127.0.0.1:18081
LOG_LEVEL=info
EOF
chown root:ai-control-center /etc/ai-control-center/center.env
chmod 0640 /etc/ai-control-center/center.env
rm -f -- /root/ai-control-center-s3.env

node --version
psql --version
