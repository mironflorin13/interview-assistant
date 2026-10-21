import type { AnswerEngine, AnswerInput, DetectQuestionInput, DetectQuestionResult } from './answerEngine';
import { guessLanguage, looksLikeQuestion } from './questionHeuristics';

/**
 * Offline stand-in for Claude. Used when no API key is set, in tests, and in
 * CI, so the whole pipeline can run without network access or cost.
 */
export class MockAnswerEngine implements AnswerEngine {
  constructor(private readonly chunkDelayMs = 30) {}

  async detectQuestion(input: DetectQuestionInput): Promise<DetectQuestionResult> {
    return {
      isQuestion: looksLikeQuestion(input.candidate),
      question: input.candidate.trim(),
      language: guessLanguage(input.candidate),
    };
  }

  async streamAnswer(input: AnswerInput, onText: (textSoFar: string) => void, signal?: AbortSignal): Promise<string> {
    const answer =
      input.language === 'ro'
        ? `[Răspuns demo] Aici va apărea un răspuns sugerat la: "${input.question}". Adaugă o cheie API în Setări pentru răspunsuri reale.`
        : `[Demo answer] A suggested answer to "${input.question}" will appear here. Add an API key in Settings for real answers.`;
    let text = '';
    for (const word of answer.split(' ')) {
      if (signal?.aborted) throw new Error('aborted');
      text = text ? `${text} ${word}` : word;
      onText(text);
      if (this.chunkDelayMs > 0) await new Promise((r) => setTimeout(r, this.chunkDelayMs));
    }
    return text;
  }
}
