# CPU dictation with GigaAM-v3 RNN-T Q8

LLM Control uses a separate CPU speech-recognition path because the Gemma 4
text/image/video projector does not consume audio. Uploaded audio is
transcribed first and the transcript is added to the model prompt. Microphone
dictation inserts the recognized text into the composer.

The selected model is `GigaAM-v3 e2e RNN-T Q8_0` running through
`transcribe.cpp`. The browser records lossless 16-bit PCM WAV, mono, 16 kHz.
The server keeps the ASR model resident and serializes inference, so
requests do not pay model-load latency and cannot run concurrently on one model
instance.

On the dual E5-2698 v4 host, an 8-thread session was fastest in the measured
8/12/16/20/24/32/40-thread sweep: a 4.5-second Russian sample completed in
0.642 seconds (7.01x real time). More threads increased cross-core/NUMA
overhead, so the service intentionally uses 8 rather than all 80 logical CPUs.
The complete HTTP request, including FFmpeg decoding and JSON/base64 overhead,
completed in 0.948 seconds (4.75x real time).

The installer pins `transcribe.cpp` commit `223c9b067ce32694544e841bde1db50fa041d916`
and verifies the model SHA-256
`78d63b47723b7f8d78c6113a6ef983b5a86e2a86f6c273e1f5cb6967b1c4467a`.

## UI behavior

The deployed LLM Control composer accepts files from the picker and by dropping
them anywhere over the application:

- images up to 12 MB and videos up to 32 MB are passed to the Gemma 4
  multimodal projector;
- audio up to 24 MB is transcribed locally, then its transcript becomes a text
  part of the user message (this also works with the text-only Qwen engine);
- UTF-8 text and common source/config formats up to 256 KB become named text
  parts in the prompt;
- at most six files can be attached to one message.

Binary attachment data is not retained in browser storage after a reload.
Audio transcripts and text-file contents are retained so the conversation can
continue without retransmitting binary media.

Microphone capture uses Web Audio, a browser-quality resample to 16 kHz, and a
16-bit PCM WAV encoder. The composer shows a dedicated microphone icon and a
live 16-band spectrum while recording. The ASR service pads every segment with
0.65 seconds of leading and 0.20 seconds of trailing silence. This gives the
RNN-T encoder boundary context and prevents the first spoken word from being
cut off when the user starts talking immediately after pressing the icon. Mic
initialization begins on pointer-down rather than waiting for the completed
click, and the spectrum appears only after the audio graph is actually ready.

Microphone capture requires a secure browser context, so the reference
Nginx profile exposes HTTPS on port 8443 and sends
`Permissions-Policy: microphone=(self)`. The self-signed local certificate must
be trusted once on the client machine before microphone permission can be
granted. File upload and drag-and-drop continue to work over port 8080.

## Install

From a Colibri checkout on the inference host:

```bash
sudo ./c/scripts/install-gigaam-asr.sh
sudo ./c/scripts/create-local-ui-certificate.sh 192.168.31.59
```

Install `c/scripts/nginx-llm-control-dual.conf` after creating the certificate,
then test and reload Nginx. The example uses the current inference host; pass
the IP address or DNS name that browsers actually use in other deployments.
The certificate is self-signed, so import it into the client trust store or
accept it once before granting microphone permission.

The ASR service listens only on `127.0.0.1:18081` and independently rejects
request bodies above 48 MB. The reference Nginx limit is 64 MB so base64-encoded
multimodal requests also fit. Because this GigaAM variant is a short-form model,
microphone dictation stops at 24.5 seconds and longer uploaded audio is split
into 24-second chunks.

## API

`POST /v1/audio/transcriptions` accepts JSON:

```json
{"audio":"<base64>","filename":"recording.wav","mime_type":"audio/wav"}
```

The response includes `text`, clip and processing durations, and
`realtime_factor`. Values above `2.0` meet the interactive dictation target.
