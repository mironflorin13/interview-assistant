import type {
  AnswerUpdate,
  AppSettings,
  DetectedQuestion,
  KeyedProvider,
  PublicSettings,
  Speaker,
  TranscriptSegment,
} from '../shared/types';

/** The only surface the renderer gets, exposed as window.assistant. */
export interface AssistantApi {
  getSettings(): Promise<PublicSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<PublicSettings>;
  setApiKey(provider: KeyedProvider, key: string): Promise<PublicSettings>;
  clearApiKey(provider: KeyedProvider): Promise<PublicSettings>;
  startSession(): Promise<void>;
  stopSession(): Promise<void>;
  sendAudio(speaker: Speaker, samples: Int16Array): void;
  simulateUtterance(speaker: Speaker, text: string): Promise<void>;
  onTranscript(listener: (segment: TranscriptSegment) => void): () => void;
  onQuestion(listener: (question: DetectedQuestion) => void): () => void;
  onAnswer(listener: (update: AnswerUpdate) => void): () => void;
}

declare global {
  interface Window {
    assistant: AssistantApi;
  }
}
