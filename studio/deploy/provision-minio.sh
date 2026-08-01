#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/local/bin:${PATH}"

if [[ ! -x /usr/local/bin/mc ]]; then
  curl -fsSLo /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc
  chmod 0755 /usr/local/bin/mc
fi

set -a
# shellcheck disable=SC1091
source /etc/default/minio
set +a
: "${MINIO_ROOT_USER:?}" "${MINIO_ROOT_PASSWORD:?}"

mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing local/ai-control-center >/dev/null

policy_file="$(mktemp)"
trap 'rm -f -- "$policy_file"' EXIT
cat > "$policy_file" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::ai-control-center"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::ai-control-center/*"]
    }
  ]
}
JSON
mc admin policy create local ai-control-center-policy "$policy_file" >/dev/null

access_key=${AI_CONTROL_CENTER_S3_ACCESS_KEY:-ai-control-center-202}
secret_key="$(openssl rand -hex 32)"
mc admin user add local "$access_key" "$secret_key" >/dev/null
mc admin policy attach local ai-control-center-policy --user "$access_key" >/dev/null

umask 077
cat > /root/ai-control-center-s3.env <<EOF
S3_ACCESS_KEY_ID=${access_key}
S3_SECRET_ACCESS_KEY=${secret_key}
EOF

mc stat local/ai-control-center >/dev/null
echo "MinIO bucket and restricted service identity are ready"
