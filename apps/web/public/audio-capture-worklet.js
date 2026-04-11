// audio-capture-worklet.js — AudioWorkletProcessor for mic capture
//
// Runs on the dedicated AudioWorklet thread, completely independent of the
// React main thread. This prevents React re-renders from ever delaying or
// dropping audio callbacks (the main failure mode of ScriptProcessorNode).
//
// Accumulates 4096 Float32 samples (256 ms at 16 kHz), converts to Int16 PCM,
// computes RMS energy for VAD, then posts both to the main thread.
// The main thread encodes to base64 and sends over the WebSocket.

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // Internal float buffer — reused each chunk to avoid GC pressure
    this._buf = new Float32Array(4096)
    this._pos = 0
  }

  process(inputs) {
    const inp = inputs[0]?.[0]
    if (!inp) return true // keep processor alive

    for (let i = 0; i < inp.length; i++) {
      this._buf[this._pos++] = inp[i] ?? 0

      if (this._pos === 4096) {
        // Compute RMS energy for VAD on the audio thread — cheap and accurate
        let sumSq = 0
        for (let j = 0; j < 4096; j++) {
          const s = this._buf[j] ?? 0
          sumSq += s * s
        }
        const rms = Math.sqrt(sumSq / 4096)

        // Convert Float32 → Int16 PCM
        const pcm = new Int16Array(4096)
        for (let j = 0; j < 4096; j++) {
          const s = this._buf[j] ?? 0
          pcm[j] = Math.max(-32768, Math.min(32767, (s * 32768) | 0))
        }

        // Transfer the ArrayBuffer (zero-copy) to the main thread
        this.port.postMessage({ pcm: pcm.buffer, rms }, [pcm.buffer])
        this._pos = 0
      }
    }

    return true // returning false would stop the processor
  }
}

registerProcessor('audio-capture', AudioCaptureProcessor)
