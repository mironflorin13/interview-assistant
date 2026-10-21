import type {
  AnswerUpdate,
  AppSettings,
  DetectedQuestion,
  Language,
  TranscriptSegment,
} from '../shared/types';
import type { AnswerEngine } from './answerEngine';
import { guessLanguage, looksLikeQuestion } from './questionHeuristics';

export interface SessionEvents {
  transcript(segment: TranscriptSegment): void;
  question(question: DetectedQuestion): void;
  answer(update: AnswerUpdate): void;
}

/** How much transcript Claude sees as context, in characters. */
const CONTEXT_CHARS = 6000;

/**
 * Turns transcript segments into detected questions and streamed answers.
 * Pure orchestration: no Electron, no network, so it is unit-tested with a mock engine.
 */
export class InterviewSession {
  private readonly segments: TranscriptSegment[] = [];
  private answerAbort: AbortController | null = null;
  private nextQuestionId = 1;

  constructor(
    private readonly engine: AnswerEngine,
    private readonly settings: () => AppSettings,
    private readonly events: SessionEvents,
    private readonly now: () => number = Date.now,
  ) {}

  /** Feed every STT result here, interim or final. */
  async onSegment(segment: TranscriptSegment): Promise<void> {
    const existing = this.segments.findIndex((s) => s.id === segment.id);
    if (existing >= 0) this.segments[existing] = segment;
    else this.segments.push(segment);
    this.events.transcript(segment);

    if (!segment.isFinal || segment.speaker !== 'interviewer') return;
    if (!looksLikeQuestion(segment.text)) return;

    const recentTranscript = this.recentTranscript();
    const detection = await this.engine.detectQuestion({ recentTranscript, candidate: segment.text });
    if (!detection.isQuestion) return;

    const question: DetectedQuestion = {
      id: `q${this.nextQuestionId++}`,
      text: detection.question || segment.text,
      language: detection.language ?? segment.language ?? guessLanguage(segment.text),
      askedAt: this.now(),
    };
    this.events.question(question);
    await this.answer(question, recentTranscript);
  }

  stop(): void {
    this.answerAbort?.abort();
    this.answerAbort = null;
  }

  private async answer(question: DetectedQuestion, recentTranscript: string): Promise<void> {
    // A new question makes the previous answer obsolete.
    this.answerAbort?.abort();
    const abort = new AbortController();
    this.answerAbort = abort;

    const settings = this.settings();
    const language: Language = settings.answerLanguage === 'auto' ? question.language : settings.answerLanguage;
    try {
      const text = await this.engine.streamAnswer(
        { question: question.text, language, recentTranscript, resumeText: settings.resumeText },
        (textSoFar) => {
          if (!abort.signal.aborted) this.events.answer({ questionId: question.id, text: textSoFar, done: false });
        },
        abort.signal,
      );
      if (!abort.signal.aborted) this.events.answer({ questionId: question.id, text, done: true });
    } catch (err) {
      if (abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      this.events.answer({ questionId: question.id, text: '', done: true, error: message });
    } finally {
      if (this.answerAbort === abort) this.answerAbort = null;
    }
  }

  private recentTranscript(): string {
    const lines: string[] = [];
    let size = 0;
    for (let i = this.segments.length - 1; i >= 0 && size < CONTEXT_CHARS; i--) {
      const s = this.segments[i]!;
      if (!s.isFinal) continue;
      const line = `${s.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${s.text}`;
      lines.push(line);
      size += line.length;
    }
    return lines.reverse().join('\n');
  }
}
