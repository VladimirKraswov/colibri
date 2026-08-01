#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:${PATH}"
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

node_version=v22.23.1
node_archive="node-${node_version}-linux-x64.tar.xz"
node_base="https://nodejs.org/dist/${node_version}"
center_ip=${AI_CONTROL_CENTER_IP:-192.168.31.60}
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

id ai-control-center >/dev/null 2>&1 || useradd --system --home /var/lib/ai-control-center --shell /usr/sbin/nologin ai-control-center
install -d -o ai-control-center -g ai-control-center -m 0750 /var/lib/ai-control-center
install -d -o root -g ai-control-center -m 0750 /etc/ai-control-center
install -d -o root -g root -m 0755 /etc/nginx/ssl

if [[ ! -r /root/ai-control-center-s3.env ]]; then
  echo "/root/ai-control-center-s3.env is required; provision a restricted MinIO service account first" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source /root/ai-control-center-s3.env
set +a
: "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}"

db_password=$(openssl rand -hex 24)
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

umask 027
cat > /etc/ai-control-center/center.env <<EOF
NODE_ENV=production
AI_CONTROL_CENTER_HOST=127.0.0.1
AI_CONTROL_CENTER_PORT=3000
AI_CONTROL_CENTER_PUBLIC_ORIGIN=https://${center_ip}:8443
AI_CONTROL_CENTER_DEFAULT_WORKSPACE=local
AI_CONTROL_CENTER_DATA_DIR=/var/lib/ai-control-center
AI_CONTROL_CENTER_WEB_ROOT=/opt/ai-control-center/apps/web/dist
DATABASE_URL=postgresql://ai_control_center:${db_password}@127.0.0.1:5432/ai_control_center
DATABASE_POOL_MAX=12
S3_ENDPOINT=${minio_endpoint}
S3_REGION=us-east-1
S3_BUCKET=ai-control-center
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
S3_FORCE_PATH_STYLE=true
INFERENCE_PROVIDERS_JSON='{"gemma":"${cpu_inference_origin}/api/llm/gemma4","qwen":"${cpu_inference_origin}/api/llm/legacy"}'
ASR_BASE_URL=${cpu_inference_origin}/api/asr
LOG_LEVEL=info
EOF
chown root:ai-control-center /etc/ai-control-center/center.env
chmod 0640 /etc/ai-control-center/center.env
rm -f -- /root/ai-control-center-s3.env

if [[ ! -s /etc/nginx/ssl/ai-control-center.key || ! -s /etc/nginx/ssl/ai-control-center.crt ]]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 825 \
    -keyout /etc/nginx/ssl/ai-control-center.key \
    -out /etc/nginx/ssl/ai-control-center.crt \
    -subj "/CN=${center_ip}" \
    -addext "subjectAltName=IP:${center_ip}"
  chmod 0600 /etc/nginx/ssl/ai-control-center.key
  chmod 0644 /etc/nginx/ssl/ai-control-center.crt
fi

node --version
psql --version
