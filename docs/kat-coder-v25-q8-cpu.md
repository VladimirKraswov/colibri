# KAT-Coder V2.5 Dev Q8 on the Qwen3.6 Colibri CPU engine

`Kwaipilot/KAT-Coder-V2.5-Dev` uses the same Qwen3.6-35B-A3B hybrid
architecture as the model supported by `qwen36_serve`: 40 layers, 256 routed
experts, 8 active experts, and a mix of 30 linear-attention and 10
full-attention layers. No engine-side approximation or architecture change is
needed.

Convert directly to the row-wise Q8 container without retaining the complete
BF16 checkpoint:

```bash
python c/tools/convert_qwen36.py \
  --repo Kwaipilot/KAT-Coder-V2.5-Dev \
  --out /Volumes/Extend/kat-coder-v2.5-dev-colibri-q8 \
  --ebits 8 \
  --low-disk
```

Run it CPU-only:

```bash
SNAP=/Volumes/Extend/kat-coder-v2.5-dev-colibri-q8 \
MODEL=kat-coder-v2.5-dev-colibri-q8 \
THREADS=20 \
PORT=18080 \
  c/scripts/run_qwen36_q8_cpu.sh
```

The production unit is `c/scripts/colibri-kat-coder.service`. It keeps the
tuned 20-worker configuration while allowing the process to use all 40
physical CPU cores and interleaves memory across both NUMA nodes. The launcher
sets empty CUDA/HIP visibility variables and the C server links no GPU backend.

After a successful conversion, remove the temporary Hugging Face download
directory. The converted Q8 container is self-contained and does not require
the BF16 shards or an access token at runtime.
