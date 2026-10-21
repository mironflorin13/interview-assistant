// Runs on the audio thread. Downsamples Float32 input to 16 kHz Int16 PCM and
// posts ~100 ms chunks to the main thread.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.position = 0;
    this.out = [];
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    while (this.position < channel.length) {
      const s = Math.max(-1, Math.min(1, channel[Math.floor(this.position)]));
      this.out.push(s < 0 ? s * 0x8000 : s * 0x7fff);
      this.position += this.ratio;
    }
    this.position -= channel.length;
    if (this.out.length >= 1600) {
      const chunk = Int16Array.from(this.out);
      this.out = [];
      this.port.postMessage(chunk, [chunk.buffer]);
    }
    return true;
  }
}

registerProcessor('pcm-worklet', PcmWorklet);
