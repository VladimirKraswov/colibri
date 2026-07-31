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

The launcher can use all 40 physical cores, spreads workers across both sockets,
keeps OpenMP workers hot, disables every GPU visibility path, preloads all
10,240 experts into RAM, and asks Linux to interleave pages across NUMA nodes.
On the dual E5-2698 v4 reference host, `THREADS=20` was faster and more stable
than 24 or 32 workers, so the production unit uses that measured setting while
allowing affinity across all 40 physical cores:

```bash
SNAP=/fast/qwen36-hauhau-colibri-q8 HOST=127.0.0.1 PORT=18080 CTX_SIZE=131072 THREADS=20 \
  c/scripts/run_qwen36_q8_cpu.sh
```

The server defaults to loopback. Set `HOST=0.0.0.0` only when a firewall or an
authenticated reverse proxy protects the API. `CTX_SIZE` defaults to 131072;
requests whose prompt plus requested completion exceed it are rejected before
KV allocation. Very large prefills remain quadratic in the full-attention
layers, so the limit is a correctness boundary rather than a latency promise.
The OpenAI chat endpoint follows the model's default thinking template. Send
`"chat_template_kwargs":{"enable_thinking":false}` (or top-level
`"enable_thinking":false`) to use Qwen's explicit no-thinking prefix.

For quality parity with the reference `Q8_K_P` layout, the MoE router remains
F32 by default even when other dense matrices use in-memory row-Q8. Setting
`COLI_ROUTER_I8=1` is an explicit ablation and should pass the quality gate
before deployment.

On F16C CPUs such as Broadwell-EP, attention Q/K/V and the large DeltaNet input
projections remain F16 (`COLI_SENSITIVE_F16=1`, the default), matching the
reference GGUF's precision choices. Output, shared-expert, routed-expert, and
LM-head matrices use Q8. Set `COLI_SENSITIVE_F16=0` only as a measured speed
ablation; it requantizes those sensitive projections to row-Q8.

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

## Resident dual-engine UI

For a reversible production trial, keep llama.cpp on loopback port 8081 and
Colibri on loopback port 18080. The example
`c/scripts/nginx-llm-studio-dual.conf` exposes explicit profile prefixes:

- `/api/llm/legacy/` forwards to llama.cpp;
- `/api/llm/colibri/` forwards to Colibri;
- `/api/llm/` and the root OpenAI-compatible API remain on Colibri for backward
  compatibility.

The chat UI must store an `engineId` on every conversation. Changing engines
after an assistant response must preserve the old conversation as history and
create a new empty conversation with no messages, compressed summary, or token
state. Opening a saved conversation should restore its bound engine. Disable the
selector while generation is active so one streamed response cannot cross an
engine boundary.
