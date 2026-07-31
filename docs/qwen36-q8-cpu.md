# Qwen3.6-35B-A3B Q8 on a large dual-socket CPU host

This profile is deliberately CPU-only. The `qwen36` and `qwen36_serve` targets
do not link CUDA, Vulkan, HIP, or Metal backends.

## Quality baseline

The HauhauCS `Q8_K_P` GGUF is a model-specific mixed quant produced with an
importance matrix. Colibri does not read GGUF directly. Use the BF16
dequantization of that exact artifact as the conversion source, then require an
A/B quality pass before replacing an existing endpoint:

```bash
python3 c/tools/convert_qwen36.py \
  --repo ericpandev/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-bf16 \
  --out /fast/qwen36-hauhau-colibri-q8 \
  --ebits 8 \
  --low-disk
```

This preserves Q8 storage for routed experts and F16 storage for the other
container tensors. It is not bit-identical to `Q8_K_P`: the dequantized expert
rows are quantized again into Colibri's symmetric row-Q8 layout. Treat output
parity and task evaluation as release gates, not assumptions.

## Broadwell-EP profile

Build on the target CPU so `-march=native` enables AVX2 and FMA:

```bash
make -C c qwen36 qwen36_serve ARCH=native
```

The launcher uses 40 physical cores, spreads them across both sockets, keeps
OpenMP workers hot, disables every GPU visibility path, preloads all 10,240
experts into RAM, and asks Linux to interleave pages across NUMA nodes:

```bash
SNAP=/fast/qwen36-hauhau-colibri-q8 HOST=127.0.0.1 PORT=18080 \
  c/scripts/run_qwen36_q8_cpu.sh
```

The server defaults to loopback. Set `HOST=0.0.0.0` only when a firewall or an
authenticated reverse proxy protects the API.

If the LXC cannot set a NUMA memory policy, configure interleaving/NUMA at the
Proxmox container boundary or run the service in a VM with host CPU exposure.

## A/B gate

Keep the llama.cpp service on port 8080 and start Colibri on 18080. Run:

```bash
python3 c/tools/benchmark_qwen36_ab.py \
  --baseline http://127.0.0.1:8080 \
  --candidate http://127.0.0.1:18080 \
  --out qwen36-ab.json
```

Do not switch the reverse proxy unless the candidate is faster on a multi-prompt
median and passes the same deterministic task suite. For strict numerical
validation, compare dumped full-model logits against the BF16 oracle and require
cosine similarity at least as high as the existing Q8 deployment.
