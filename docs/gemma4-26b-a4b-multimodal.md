# Gemma 4 26B-A4B QAT Q4_0: CPU multimodal profile

This branch adds the deployment profile used by `colibri-e5q` for the official
Gemma 4 26B-A4B instruction-tuned QAT release. It deliberately keeps the
existing Qwen llama.cpp service independent and resident for direct A/B tests.

## Exact artifacts

- Source QAT checkpoint: `google/gemma-4-26B-A4B-it-qat-q4_0-unquantized`
- Deployable language model: `google/gemma-4-26B-A4B-it-qat-q4_0-gguf/gemma-4-26B_q4_0-it.gguf`
- Multimodal projector: `google/gemma-4-26B-A4B-it-qat-q4_0-gguf/gemma-4-26B-it-mmproj.gguf`

The service consumes the official QAT-derived GGUF directly. It does not keep
the roughly 52 GB half-precision checkpoint and does not requantize a BF16/F16
model after download.

Verify the artifacts before the first start:

```text
3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d  gemma-4-26B_q4_0-it.gguf
a359953a076b877db30c31dbbb4c6d93b4a6e017ee5db5784247e4d4c0dd4f3b  gemma-4-26B-it-mmproj.gguf
```

## Runtime isolation

Build a current `ggml-org/llama.cpp` tree separately with `GGML_NATIVE=ON`,
OpenMP enabled, all GPU backends disabled, and the `llama-server` plus
`llama-mtmd-cli` targets. The production profile is
`c/scripts/gemma4-26b-mm.service` and binds only to `127.0.0.1:18080`.

The previous Qwen service remains on `127.0.0.1:8081`. Do not replace its
binary, model path, unit, affinity, or alias when deploying this profile.

## Multimodal contract

The OpenAI-compatible `/v1/chat/completions` endpoint accepts:

- images as `image_url` content parts using a data URL;
- videos as `input_video` content parts using raw base64 data and an
  `mp4`, `ogg`, or `auto` format hint;
- text in the same user message after the media content parts.

Gemma 4 26B-A4B understands text, images, and sequences of video frames. It has
no native audio encoder. Audio input must therefore remain disabled in the UI
for this exact checkpoint; adding speech-to-text would be a separate model and
pipeline, not native Gemma 4 26B multimodality.

## Quality and performance policy

- keep the official QAT Q4_0 weights; do not quantize the language model again;
- keep K/V caches at F16 for the quality baseline;
- keep the vision projector on CPU and load both GGUF files at service start;
- measure generation speed only after one warm-up request;
- validate text and image quality before testing more aggressive KV-cache or
  thread-count changes.

The first deployment is a correctness baseline. Broadwell thread count, NUMA
placement, batch size, and image token bounds can be changed only after an A/B
run records both tokens/second and output parity.

On the reference dual E5-2698 v4 host, a two-repetition `llama-bench` sweep found
24 generation threads best and stable at 13.99 tokens/s. A 32-thread prompt
batch was fastest at 108.49 prompt tokens/s. The deployed split is therefore
`--threads 24 --threads-batch 32`; all 40 physical cores remain available to
the service and the kernel scheduler.

The first decode after a process restart is substantially slower while CPU
graphs and model pages are touched. The unit therefore runs
`c/scripts/warmup_gemma4.sh` as `ExecStartPost`; systemd reports the service as
fully started only after that private loopback warm-up completes.
