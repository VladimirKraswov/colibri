#!/usr/bin/env bash
set -euo pipefail

: "${SNAP:?Set SNAP to the converted Qwen3.6 Q8 container directory}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="${ENGINE:-${SCRIPT_DIR}/../qwen36_serve}"
PORT="${PORT:-18080}"
HOST="${HOST:-127.0.0.1}"
CTX_SIZE="${CTX_SIZE:-131072}"
THREADS="${THREADS:-40}"
CACHE_PER_LAYER="${CACHE_PER_LAYER:-256}"

if [[ ! -x "${ENGINE}" ]]; then
  echo "qwen36_serve is missing: ${ENGINE}" >&2
  echo "Build it with: make -C ${SCRIPT_DIR}/.. qwen36_serve ARCH=native" >&2
  exit 1
fi

# CPU-only is structural (qwen36_serve has no GPU backend linked); these also
# keep accidental library/device discovery disabled in wrappers and containers.
export CUDA_VISIBLE_DEVICES=""
export HIP_VISIBLE_DEVICES=""
export NVIDIA_VISIBLE_DEVICES="void"

export OMP_NUM_THREADS="${THREADS}"
export OMP_DYNAMIC="FALSE"
export OMP_PLACES="cores"
export OMP_PROC_BIND="spread"
export OMP_WAIT_POLICY="ACTIVE"
export GOMP_SPINCOUNT="300000"
export MALLOC_ARENA_MAX="4"

export MODEL="${MODEL:-qwen3.6-35b-a3b-hauhau-q8-colibri-cpu}"
export PORT
export HOST
export CTX_SIZE
export COLI_DENSE_I8="${COLI_DENSE_I8:-1}"
export COLI_MOE_FUSED="${COLI_MOE_FUSED:-1}"
export COLI_PRELOAD_ALL="${COLI_PRELOAD_ALL:-1}"
export COLI_TIMERS="${COLI_TIMERS:-1}"
export PILOT="0"

cmd=("${ENGINE}" "${CACHE_PER_LAYER}" 8)
if command -v numactl >/dev/null 2>&1 && numactl --interleave=all true 2>/dev/null; then
  exec numactl --interleave=all "${cmd[@]}"
fi

echo "warning: NUMA interleave is unavailable; running with the container's memory policy" >&2
exec "${cmd[@]}"
