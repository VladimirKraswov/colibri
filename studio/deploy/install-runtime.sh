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
id llm-control >/dev/null 2>&1 || useradd --system --home /var/lib/llm-control --shell /usr/sbin/nologin llm-control
install -d -o llm-control -g llm-control -m 0750 /var/lib/llm-control
install -d -o root -g llm-control -m 0750 /etc/llm-control

db_password="$(openssl rand -hex 24)"
runuser -u postgres -- psql --set ON_ERROR_STOP=1 --set db_password="$db_password" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'llm_control') THEN
    CREATE ROLE llm_control LOGIN;
  END IF;
END $$;
SELECT format('ALTER ROLE llm_control PASSWORD %L', :'db_password') \gexec
SELECT 'CREATE DATABASE llm_control OWNER llm_control'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'llm_control') \gexec
SQL

if [[ ! -r /root/llm-control-s3.env ]]; then
  echo "/root/llm-control-s3.env is required; provision MinIO first" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source /root/llm-control-s3.env
set +a
: "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}"

umask 027
cat > /etc/llm-control/control.env <<EOF
NODE_ENV=production
LLM_CONTROL_HOST=127.0.0.1
LLM_CONTROL_PORT=3000
LLM_CONTROL_PUBLIC_ORIGIN=https://192.168.31.59:8443
LLM_CONTROL_DEFAULT_WORKSPACE=local
LLM_CONTROL_DATA_DIR=/var/lib/llm-control
LLM_CONTROL_WEB_ROOT=/opt/llm-control/apps/web/dist
DATABASE_URL=postgresql://llm_control:${db_password}@127.0.0.1:5432/llm_control
DATABASE_POOL_MAX=12
S3_ENDPOINT=http://192.168.31.245:9000
S3_REGION=us-east-1
S3_BUCKET=llm-control
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
S3_FORCE_PATH_STYLE=true
GEMMA_BASE_URL=http://127.0.0.1:18080
QWEN_BASE_URL=http://127.0.0.1:8081
ASR_BASE_URL=http://127.0.0.1:18081
LOG_LEVEL=info
EOF
chown root:llm-control /etc/llm-control/control.env
chmod 0640 /etc/llm-control/control.env
rm -f -- /root/llm-control-s3.env

node --version
psql --version
