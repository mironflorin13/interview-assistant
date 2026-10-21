import { STT_SAMPLE_RATE } from '../shared/types';

export interface ChunkerOptions {
  sampleRate?: number;
  /** RMS level (0..1) above which a frame counts as speech. */
  speechThreshold?: number;
  /** Silence after speech that ends an utterance. */
  silenceMs?: number;
  /** Hard cap so long monologues still get transcribed while they happen. */
  maxUtteranceMs?: number;
  /** Utterances shorter than this are dropped as noise. */
  minSpeechMs?: number;
}

const FRAME_MS = 20;

/**
 * Splits a continuous PCM stream into utterances using a simple energy-based
 * voice activity check. Needed for request-based STT such as Whisper, which
 * transcribes finished clips rather than a live stream.
 */
export class UtteranceChunker {
  private readonly sampleRate: number;
  private readonly threshold: number;
  private readonly silenceFrames: number;
  private readonly maxSamples: number;
  private readonly minSpeechFrames: number;
  private readonly frameSize: number;

  private pending: number[] = [];
  private utterance: Int16Array[] = [];
  private utteranceSamples = 0;
  private speechFrames = 0;
  private trailingSilenceFrames = 0;

  constructor(
    private readonly onUtterance: (pcm: Int16Array) => void,
    options: ChunkerOptions = {},
  ) {
    this.sampleRate = options.sampleRate ?? STT_SAMPLE_RATE;
    this.threshold = options.speechThreshold ?? 0.015;
    this.frameSize = Math.round((this.sampleRate * FRAME_MS) / 1000);
    this.silenceFrames = Math.round((options.silenceMs ?? 700) / FRAME_MS);
    this.maxSamples = Math.round(((options.maxUtteranceMs ?? 15000) * this.sampleRate) / 1000);
    this.minSpeechFrames = Math.round((options.minSpeechMs ?? 300) / FRAME_MS);
  }

  push(pcm: Int16Array): void {
    for (const sample of pcm) this.pending.push(sample);
    while (this.pending.length >= this.frameSize) {
      const frame = Int16Array.from(this.pending.splice(0, this.frameSize));
      this.processFrame(frame);
    }
  }

  flush(): void {
    this.emit();
  }

  private processFrame(frame: Int16Array): void {
    const isSpeech = rms(frame) >= this.threshold;
    if (isSpeech) {
      this.speechFrames++;
      this.trailingSilenceFrames = 0;
    } else if (this.speechFrames > 0) {
      this.trailingSilenceFrames++;
    } else {
      return; // Silence before any speech is not kept.
    }
    this.utterance.push(frame);
    this.utteranceSamples += frame.length;

    if (this.trailingSilenceFrames >= this.silenceFrames || this.utteranceSamples >= this.maxSamples) {
      this.emit();
    }
  }

  private emit(): void {
    if (this.speechFrames >= this.minSpeechFrames) {
      const out = new Int16Array(this.utteranceSamples);
      let offset = 0;
      for (const f of this.utterance) {
        out.set(f, offset);
        offset += f.length;
      }
      this.onUtterance(out);
    }
    this.utterance = [];
    this.utteranceSamples = 0;
    this.speechFrames = 0;
    this.trailingSilenceFrames = 0;
  }
}

function rms(frame: Int16Array): number {
  let sum = 0;
  for (const s of frame) sum += (s / 32768) ** 2;
  return Math.sqrt(sum / frame.length);
}

/** Wraps 16-bit mono PCM in a WAV container for upload. */
export function encodeWav(pcm: Int16Array, sampleRate = STT_SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const dataBytes = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM format
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}
