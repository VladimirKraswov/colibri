#!/usr/bin/env bash
set -euo pipefail

TRANSCRIBE_COMMIT=223c9b067ce32694544e841bde1db50fa041d916
TRANSCRIBE_DIR=/opt/transcribe.cpp-223c9b0
MODEL_DIR=/Volumes/Extend/asr
MODEL_PATH=${MODEL_DIR}/gigaam-v3-e2e-rnnt-Q8_0.gguf
MODEL_URL=https://huggingface.co/handy-computer/gigaam-v3-e2e-rnnt-gguf/resolve/main/gigaam-v3-e2e-rnnt-Q8_0.gguf
MODEL_SHA256=78d63b47723b7f8d78c6113a6ef983b5a86e2a86f6c273e1f5cb6967b1c4467a
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/../.." && pwd)

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  build-essential ca-certificates cmake curl ffmpeg git libopenblas-dev ninja-build python3

if [[ ! -d ${TRANSCRIBE_DIR}/.git ]]; then
  git clone https://github.com/handy-computer/transcribe.cpp.git "${TRANSCRIBE_DIR}"
fi
git -C "${TRANSCRIBE_DIR}" fetch --depth 1 origin "${TRANSCRIBE_COMMIT}"
git -C "${TRANSCRIBE_DIR}" checkout --detach "${TRANSCRIBE_COMMIT}"

cmake -S "${TRANSCRIBE_DIR}" -B "${TRANSCRIBE_DIR}/build-shared" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DTRANSCRIBE_BUILD_SHARED=ON \
  -DTRANSCRIBE_BUILD_EXAMPLES=OFF \
  -DTRANSCRIBE_BUILD_TESTS=OFF \
  -DTRANSCRIBE_BUILD_TOOLS=OFF \
  -DTRANSCRIBE_USE_SYSTEM_BLAS=ON \
  -DTRANSCRIBE_USE_OPENMP=OFF \
  -DGGML_NATIVE=ON
cmake --build "${TRANSCRIBE_DIR}/build-shared" --target transcribe --parallel "$(nproc)"
ln -sfn "${TRANSCRIBE_DIR}" /opt/transcribe.cpp

install -d -o root -g root -m 0755 "${MODEL_DIR}" /usr/local/libexec
if [[ ! -s ${MODEL_PATH} ]]; then
  tmp_model=$(mktemp "${MODEL_DIR}/.gigaam.XXXXXX")
  trap 'rm -f -- "${tmp_model:-}"' EXIT
  curl -fL --retry 5 --retry-delay 2 "${MODEL_URL}" -o "${tmp_model}"
  test "$(stat -c %s "${tmp_model}")" -gt 250000000
  printf '%s  %s\n' "${MODEL_SHA256}" "${tmp_model}" | sha256sum -c -
  install -o root -g root -m 0644 "${tmp_model}" "${MODEL_PATH}"
  rm -f -- "${tmp_model}"
  trap - EXIT
fi
printf '%s  %s\n' "${MODEL_SHA256}" "${MODEL_PATH}" | sha256sum -c -

install -o root -g root -m 0755 \
  "${REPO_ROOT}/c/asr/gigaam_asr_server.py" /usr/local/libexec/gigaam_asr_server.py
install -o root -g root -m 0644 \
  "${SCRIPT_DIR}/gigaam-asr.service" /etc/systemd/system/gigaam-asr.service

systemctl daemon-reload
systemctl enable --now gigaam-asr.service
curl --fail --retry 30 --retry-delay 2 http://127.0.0.1:18081/health
