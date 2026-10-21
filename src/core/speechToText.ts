import type { Speaker, TranscriptSegment } from '../shared/types';

export type SegmentSink = (segment: TranscriptSegment) => void;

/**
 * A speech-to-text backend. Audio arrives as 16 kHz mono PCM, already split by
 * speaker (loopback = interviewer, microphone = me), and results go to the sink.
 */
export interface SpeechToText {
  pushAudio(speaker: Speaker, pcm: Int16Array): void;
  /** Flush buffered audio and stop. */
  stop(): Promise<void>;
}
