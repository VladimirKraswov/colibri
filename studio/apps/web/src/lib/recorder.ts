export interface PcmRecorder {
  stop(): Promise<Blob>
  cancel(): void
}

const merge = (chunks: Float32Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

const resample16k = async (pcm: Float32Array, sourceRate: number) => {
  if (sourceRate === 16_000) return pcm
  const length = Math.max(1, Math.ceil(pcm.length * 16_000 / sourceRate))
  const context = new OfflineAudioContext(1, length, 16_000)
  const buffer = context.createBuffer(1, pcm.length, sourceRate)
  buffer.copyToChannel(new Float32Array(pcm), 0)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
  return (await context.startRendering()).getChannelData(0).slice()
}

const wav = (pcm: Float32Array) => {
  const leading = new Float32Array(Math.round(16_000 * 0.65))
  const trailing = new Float32Array(Math.round(16_000 * 0.20))
  const samples = merge([leading, pcm, trailing])
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ")
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16_000, true); view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, "data"); view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, value < 0 ? value * 32768 : value * 32767, true)
  })
  return new Blob([view], { type: "audio/wav" })
}

export async function createPcmRecorder(onSpectrum: (levels: number[]) => void): Promise<PcmRecorder> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Для микрофона откройте HTTPS-версию сервиса")
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const context = new AudioContext({ latencyHint: "interactive" })
  if (context.state === "suspended") await context.resume()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  const processor = context.createScriptProcessor(2048, 1, 1)
  const silent = context.createGain()
  const chunks: Float32Array[] = []
  let stopped = false
  let frame = 0
  let lastDraw = 0
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.72
  silent.gain.value = 0
  processor.onaudioprocess = (event) => { if (!stopped) chunks.push(event.inputBuffer.getChannelData(0).slice()) }
  source.connect(processor); source.connect(analyser); processor.connect(silent); analyser.connect(silent); silent.connect(context.destination)
  const frequencies = new Uint8Array(analyser.frequencyBinCount)
  const draw = (now: number) => {
    if (stopped) return
    if (now - lastDraw > 45) {
      lastDraw = now
      analyser.getByteFrequencyData(frequencies)
      const bars = Array.from({ length: 16 }, (_, index) => {
        const from = Math.floor((index / 16) ** 1.5 * frequencies.length)
        const to = Math.max(from + 1, Math.floor(((index + 1) / 16) ** 1.5 * frequencies.length))
        let peak = 0
        for (let cursor = from; cursor < to; cursor++) peak = Math.max(peak, frequencies[cursor] ?? 0)
        return Math.max(0.06, Math.min(1, peak / 180))
      })
      onSpectrum(bars)
    }
    frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)
  const close = () => {
    stopped = true
    cancelAnimationFrame(frame)
    processor.onaudioprocess = null
    stream.getTracks().forEach((track) => track.stop())
    try { source.disconnect(); processor.disconnect(); analyser.disconnect(); silent.disconnect() } catch { /* closed */ }
  }
  return {
    async stop() {
      if (stopped) throw new Error("Запись уже остановлена")
      close()
      const rate = context.sampleRate
      await context.close()
      return wav(await resample16k(merge(chunks), rate))
    },
    cancel() { if (!stopped) close(); void context.close() },
  }
}
