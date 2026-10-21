import type { Speaker } from '../../../shared/types';

/**
 * Captures two separate streams so we know who is talking without diarization:
 *  - system audio via getDisplayMedia + WASAPI loopback (the meeting app = interviewer)
 *  - the default microphone (me)
 * Each stream is downsampled to 16 kHz Int16 PCM in an AudioWorklet and handed to onChunk.
 */
export class AudioCapture {
  private context: AudioContext | null = null;
  private streams: MediaStream[] = [];

  constructor(private readonly onChunk: (speaker: Speaker, samples: Int16Array) => void) {}

  async start(): Promise<void> {
    this.context = new AudioContext();
    await this.context.audioWorklet.addModule('./pcm-worklet.js');

    // The main process answers this with the primary screen + loopback audio.
    const system = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    system.getVideoTracks().forEach((t) => t.stop());
    if (system.getAudioTracks().length === 0) {
      throw new Error('System audio is not available. Loopback capture currently needs Windows.');
    }

    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    this.streams = [system, mic];
    this.connect(system, 'interviewer');
    this.connect(mic, 'me');
  }

  async stop(): Promise<void> {
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    await this.context?.close();
    this.context = null;
  }

  private connect(stream: MediaStream, speaker: Speaker): void {
    const ctx = this.context!;
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pcm-worklet');
    node.port.onmessage = (e: MessageEvent<Int16Array>) => this.onChunk(speaker, e.data);
    source.connect(node);
    // Not connected to ctx.destination: we never play the audio back.
  }
}
