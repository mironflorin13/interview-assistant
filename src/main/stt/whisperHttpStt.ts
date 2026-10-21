import type { SegmentSink, SpeechToText } from '../../core/speechToText';
import { UtteranceChunker, encodeWav } from '../../core/utteranceChunker';
import { STT_SAMPLE_RATE, type Language, type Speaker } from '../../shared/types';

// Helps Whisper with domain words; it does not force a language.
const VOCABULARY_HINT = 'Job interview in Romanian or English. Interviu de angajare în română sau engleză.';

export interface WhisperEndpoint {
  /** Full URL that accepts a multipart WAV upload. */
  url: string;
  apiKey?: string;
  /** Extra multipart fields, e.g. the model name for Groq or language=auto for whisper.cpp. */
  fields: Record<string, string>;
}

/** Groq's hosted Whisper (OpenAI-style transcription API, free tier). */
export function groqEndpoint(apiKey: string, model: string): WhisperEndpoint {
  return { url: 'https://api.groq.com/openai/v1/audio/transcriptions', apiKey, fields: { model } };
}

/** A local whisper.cpp `whisper-server`. Free, offline, audio never leaves the PC. */
export function whisperCppEndpoint(baseUrl: string): WhisperEndpoint {
  return { url: `${baseUrl.replace(/\/$/, '')}/inference`, fields: { language: 'auto', temperature: '0.0' } };
}

/**
 * Whisper transcribes finished clips, not a live stream, so audio is cut into
 * utterances on silence and each one is uploaded as a WAV. Whisper detects
 * Romanian vs English per clip; we do not pin the language.
 */
export class WhisperHttpStt implements SpeechToText {
  private readonly chunkers: Record<Speaker, UtteranceChunker>;
  private readonly inFlight = new Set<Promise<void>>();
  private nextId = 1;

  constructor(
    private readonly endpoint: WhisperEndpoint,
    private readonly sink: SegmentSink,
    private readonly onError: (err: Error) => void,
  ) {
    this.chunkers = {
      interviewer: new UtteranceChunker((pcm) => this.transcribe('interviewer', pcm)),
      me: new UtteranceChunker((pcm) => this.transcribe('me', pcm)),
    };
  }

  pushAudio(speaker: Speaker, pcm: Int16Array): void {
    this.chunkers[speaker].push(pcm);
  }

  async stop(): Promise<void> {
    this.chunkers.interviewer.flush();
    this.chunkers.me.flush();
    await Promise.allSettled([...this.inFlight]);
  }

  private transcribe(speaker: Speaker, pcm: Int16Array): void {
    const id = `${speaker}-${this.nextId++}`;
    const startedAt = Date.now() - Math.round((pcm.length / STT_SAMPLE_RATE) * 1000);
    const job = this.request(pcm)
      .then(({ text, language }) => {
        if (text) this.sink({ id, speaker, text, language, isFinal: true, startedAt });
      })
      .catch((err: unknown) => this.onError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }

  private async request(pcm: Int16Array): Promise<{ text: string; language?: Language }> {
    const form = new FormData();
    form.append('file', new Blob([encodeWav(pcm)], { type: 'audio/wav' }), 'utterance.wav');
    form.append('response_format', 'verbose_json');
    form.append('prompt', VOCABULARY_HINT);
    for (const [k, v] of Object.entries(this.endpoint.fields)) form.append(k, v);

    const headers: Record<string, string> = {};
    if (this.endpoint.apiKey) headers.Authorization = `Bearer ${this.endpoint.apiKey}`;
    let res: Response;
    try {
      res = await fetch(this.endpoint.url, { method: 'POST', headers, body: form });
    } catch (err) {
      throw new Error(`Cannot reach the transcription server at ${this.endpoint.url}. Is it running?`, { cause: err });
    }
    if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { text?: string; language?: string };
    return { text: cleanTranscript(body.text ?? ''), language: toLanguage(body.language) };
  }
}

/** Whisper emits these on silence or music; they are not speech. */
const NON_SPEECH = /^\s*(\[[^\]]*\]|\([^)]*\))\s*$/;

export function cleanTranscript(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return NON_SPEECH.test(t) ? '' : t;
}

function toLanguage(name: string | undefined): Language | undefined {
  const n = name?.toLowerCase();
  if (n === 'romanian' || n === 'ro') return 'ro';
  if (n === 'english' || n === 'en') return 'en';
  return undefined;
}
