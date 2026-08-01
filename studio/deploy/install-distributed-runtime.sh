#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:${PATH}"
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

node_version=v22.23.1
node_archive="node-${node_version}-linux-x64.tar.xz"
node_base="https://nodejs.org/dist/${node_version}"
control_ip=${LLM_CONTROL_IP:-192.168.31.60}
cpu_inference_origin=${CPU_INFERENCE_ORIGIN:-http://192.168.31.59:8080}
minio_endpoint=${MINIO_ENDPOINT:-http://192.168.31.245:9000}

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates curl nginx openssl postgresql postgresql-contrib xz-utils

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(`.`)[0]')" -lt 22 ]]; then
  runtime_tmp=$(mktemp -d)
  trap 'rm -rf -- "$runtime_tmp"' EXIT
  curl -fsSLo "$runtime_tmp/$node_archive" "$node_base/$node_archive"
  curl -fsSLo "$runtime_tmp/SHASUMS256.txt" "$node_base/SHASUMS256.txt"
  (cd "$runtime_tmp" && grep "  $node_archive\$" SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$runtime_tmp/$node_archive" -C /usr/local --strip-components=1
fi

systemctl enable --now postgresql

cluster_version=$(pg_lsclusters --no-header | awk 'NR == 1 { print $1 }')
cluster_name=$(pg_lsclusters --no-header | awk 'NR == 1 { print $2 }')
server_encoding=$(runuser -u postgres -- psql -Atqc 'SHOW server_encoding')
if [[ $server_encoding == SQL_ASCII ]]; then
  user_database_count=$(runuser -u postgres -- psql -Atqc \
    "SELECT count(*) FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'")
  if [[ $user_database_count != 0 ]]; then
    echo "Refusing to recreate a SQL_ASCII PostgreSQL cluster that contains user databases" >&2
    exit 1
  fi
  pg_dropcluster --stop "$cluster_version" "$cluster_name"
  pg_createcluster --start --locale=C.UTF-8 --encoding=UTF8 "$cluster_version" "$cluster_name"
fi

id llm-control >/dev/null 2>&1 || useradd --system --home /var/lib/llm-control --shell /usr/sbin/nologin llm-control
install -d -o llm-control -g llm-control -m 0750 /var/lib/llm-control
install -d -o root -g llm-control -m 0750 /etc/llm-control
install -d -o root -g root -m 0755 /etc/nginx/ssl

if [[ ! -r /root/llm-control-s3.env ]]; then
  echo "/root/llm-control-s3.env is required; provision a restricted MinIO service account first" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source /root/llm-control-s3.env
set +a
: "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}"

db_password=$(openssl rand -hex 24)
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

umask 027
cat > /etc/llm-control/control.env <<EOF
NODE_ENV=production
LLM_CONTROL_HOST=127.0.0.1
LLM_CONTROL_PORT=3000
LLM_CONTROL_PUBLIC_ORIGIN=https://${control_ip}:8443
LLM_CONTROL_DEFAULT_WORKSPACE=local
LLM_CONTROL_DATA_DIR=/var/lib/llm-control
LLM_CONTROL_WEB_ROOT=/opt/llm-control/apps/web/dist
DATABASE_URL=postgresql://llm_control:${db_password}@127.0.0.1:5432/llm_control
DATABASE_POOL_MAX=12
S3_ENDPOINT=${minio_endpoint}
S3_REGION=us-east-1
S3_BUCKET=llm-control
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
S3_FORCE_PATH_STYLE=true
INFERENCE_PROVIDERS_JSON='{"gemma":"${cpu_inference_origin}/api/llm/gemma4","qwen":"${cpu_inference_origin}/api/llm/legacy"}'
ASR_BASE_URL=${cpu_inference_origin}/api/asr
LOG_LEVEL=info
EOF
chown root:llm-control /etc/llm-control/control.env
chmod 0640 /etc/llm-control/control.env
rm -f -- /root/llm-control-s3.env

if [[ ! -s /etc/nginx/ssl/llm-control.key || ! -s /etc/nginx/ssl/llm-control.crt ]]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 825 \
    -keyout /etc/nginx/ssl/llm-control.key \
    -out /etc/nginx/ssl/llm-control.crt \
    -subj "/CN=${control_ip}" \
    -addext "subjectAltName=IP:${control_ip}"
  chmod 0600 /etc/nginx/ssl/llm-control.key
  chmod 0644 /etc/nginx/ssl/llm-control.crt
fi

node --version
psql --version
