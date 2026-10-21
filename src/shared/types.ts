// Types and IPC channel names shared by the main process, preload and renderer.

/** Who is speaking. System audio (loopback) is the interviewer, the microphone is the candidate. */
export type Speaker = 'interviewer' | 'me';

/** Interview languages supported in v1. */
export type Language = 'ro' | 'en';

export interface TranscriptSegment {
  id: string;
  speaker: Speaker;
  text: string;
  language?: Language;
  /** Interim results are replaced by a later final result with the same id. */
  isFinal: boolean;
  startedAt: number;
}

export interface DetectedQuestion {
  id: string;
  text: string;
  language: Language;
  askedAt: number;
}

export interface AnswerUpdate {
  questionId: string;
  /** Full answer text so far (not a delta), so the UI can just re-render. */
  text: string;
  done: boolean;
  error?: string;
}

/** LLM backends for question detection and answers. 'mock' needs no key and no network. */
export type LlmProvider = 'mock' | 'groq' | 'gemini' | 'ollama' | 'claude';
/** Speech-to-text backends. 'mock' only transcribes text typed into the dev box. */
export type SttProvider = 'local-whisper' | 'groq' | 'mock';
/** Anything that can hold an API key. Ollama runs locally and needs none. */
export type KeyedProvider = 'groq' | 'gemini' | 'claude';

export const LLM_PROVIDERS: Record<LlmProvider, { label: string; needsKey: boolean; defaultModel: string }> = {
  mock: { label: 'Demo (offline, no key)', needsKey: false, defaultModel: 'mock' },
  groq: { label: 'Groq (free tier)', needsKey: true, defaultModel: 'llama-3.3-70b-versatile' },
  gemini: { label: 'Google Gemini (free tier)', needsKey: true, defaultModel: 'gemini-2.5-flash' },
  ollama: { label: 'Ollama (local, free)', needsKey: false, defaultModel: 'qwen2.5:7b' },
  claude: { label: 'Anthropic Claude', needsKey: true, defaultModel: 'claude-opus-5-5' },
};

export const STT_PROVIDERS: Record<SttProvider, { label: string; needsKey: boolean; defaultModel: string }> = {
  'local-whisper': { label: 'Local Whisper (free, offline)', needsKey: false, defaultModel: 'set by the model file' },
  groq: { label: 'Groq Whisper (free tier)', needsKey: true, defaultModel: 'whisper-large-v3-turbo' },
  mock: { label: 'Demo (typed text only)', needsKey: false, defaultModel: 'mock' },
};

export interface AppSettings {
  llmProvider: LlmProvider;
  /** Empty means the provider's default model. */
  llmModel: string;
  sttProvider: SttProvider;
  sttModel: string;
  /** URL of the local whisper.cpp server. */
  whisperUrl: string;
  /** Optional: path to whisper-server.exe, so the app starts the server itself. */
  whisperServerPath: string;
  /** Path to the ggml Whisper model, needed when the app starts the server. */
  whisperModelPath: string;
  ollamaUrl: string;
  /** 'auto' answers in the language the question was asked in. */
  answerLanguage: 'auto' | Language;
  resumeText: string;
}

/** What the renderer is allowed to see about settings. API keys never leave the main process. */
export interface PublicSettings extends AppSettings {
  keysSet: Record<KeyedProvider, boolean>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'mock',
  llmModel: '',
  sttProvider: 'local-whisper',
  sttModel: '',
  whisperUrl: 'http://127.0.0.1:8178',
  whisperServerPath: '',
  whisperModelPath: '',
  ollamaUrl: 'http://localhost:11434',
  answerLanguage: 'auto',
  resumeText: '',
};

/** 16 kHz mono signed 16-bit PCM, the format every STT provider we plan to use accepts. */
export const STT_SAMPLE_RATE = 16000;

export const IPC = {
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  setApiKey: 'settings:set-api-key',
  clearApiKey: 'settings:clear-api-key',
  startSession: 'session:start',
  stopSession: 'session:stop',
  audioChunk: 'audio:chunk',
  simulateUtterance: 'dev:simulate-utterance',
  onTranscript: 'event:transcript',
  onQuestion: 'event:question',
  onAnswer: 'event:answer',
} as const;
