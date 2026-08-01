#!/usr/bin/env bash
set -euo pipefail

UI_HOST=${1:-}
CERT_DIR=/etc/nginx/ssl
CERT_PATH=${CERT_DIR}/llm-control.crt
KEY_PATH=${CERT_DIR}/llm-control.key

if [[ -z ${UI_HOST} ]]; then
  printf 'usage: %s <UI IP address or DNS name>\n' "$0" >&2
  exit 2
fi
if [[ ! ${UI_HOST} =~ ^[A-Za-z0-9._:-]+$ ]]; then
  printf 'invalid UI host: %s\n' "${UI_HOST}" >&2
  exit 2
fi

if [[ ${UI_HOST} =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ ${UI_HOST} == *:* ]]; then
  SAN=IP:${UI_HOST}
else
  SAN=DNS:${UI_HOST}
fi

install -d -o root -g root -m 0755 "${CERT_DIR}"
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 825 \
  -keyout "${KEY_PATH}" \
  -out "${CERT_PATH}" \
  -subj "/CN=${UI_HOST}" \
  -addext "subjectAltName=${SAN}"
chown root:root "${CERT_PATH}" "${KEY_PATH}"
chmod 0644 "${CERT_PATH}"
chmod 0600 "${KEY_PATH}"

openssl x509 -in "${CERT_PATH}" -noout -subject -issuer -dates -ext subjectAltName
