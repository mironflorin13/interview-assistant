import type { Language } from '../shared/types';

export interface DetectQuestionInput {
  /** The last few minutes of transcript, oldest first, as "Interviewer: ..." / "Me: ..." lines. */
  recentTranscript: string;
  /** The interviewer segment that triggered detection. */
  candidate: string;
}

export interface DetectQuestionResult {
  isQuestion: boolean;
  /** The question rewritten as one clear, self-contained sentence. */
  question: string;
  language: Language;
}

export interface AnswerInput {
  question: string;
  language: Language;
  recentTranscript: string;
  resumeText: string;
}

/**
 * Everything the app needs from an LLM. The Claude implementation lives in
 * src/main/ai; tests and key-less development use the mock.
 */
export interface AnswerEngine {
  detectQuestion(input: DetectQuestionInput, signal?: AbortSignal): Promise<DetectQuestionResult>;
  /** Streams the answer; onText receives the full text so far. Resolves with the final text. */
  streamAnswer(input: AnswerInput, onText: (textSoFar: string) => void, signal?: AbortSignal): Promise<string>;
}
