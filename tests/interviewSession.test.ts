import { describe, expect, it, vi } from 'vitest';
import type { AnswerEngine } from '../src/core/answerEngine';
import { InterviewSession } from '../src/core/interviewSession';
import { MockAnswerEngine } from '../src/core/mockAnswerEngine';
import { DEFAULT_SETTINGS, type AnswerUpdate, type DetectedQuestion, type TranscriptSegment } from '../src/shared/types';

function setup(engine: AnswerEngine = new MockAnswerEngine(0), settings = DEFAULT_SETTINGS) {
  const questions: DetectedQuestion[] = [];
  const answers: AnswerUpdate[] = [];
  const session = new InterviewSession(engine, () => settings, {
    transcript: () => {},
    question: (q) => questions.push(q),
    answer: (a) => answers.push(a),
  });
  return { session, questions, answers };
}

let n = 0;
const seg = (text: string, speaker: TranscriptSegment['speaker'] = 'interviewer', isFinal = true): TranscriptSegment => ({
  id: `s${n++}`,
  speaker,
  text,
  isFinal,
  startedAt: 0,
});

describe('InterviewSession', () => {
  it('detects an interviewer question and streams an answer in its language', async () => {
    const { session, questions, answers } = setup();
    await session.onSegment(seg('De ce vrei acest job?'));
    expect(questions).toHaveLength(1);
    expect(questions[0]!.language).toBe('ro');
    const final = answers.at(-1)!;
    expect(final.done).toBe(true);
    expect(final.text).toContain('Răspuns demo');
    expect(answers.length).toBeGreaterThan(1);
  });

  it('ignores my own speech, interim results and statements', async () => {
    const engine = new MockAnswerEngine(0);
    const detect = vi.spyOn(engine, 'detectQuestion');
    const { session, questions } = setup(engine);
    await session.onSegment(seg('What do I say here?', 'me'));
    await session.onSegment(seg('What is your', 'interviewer', false));
    await session.onSegment(seg('Thanks, that was helpful.'));
    expect(detect).not.toHaveBeenCalled();
    expect(questions).toHaveLength(0);
  });

  it('respects a fixed answer language', async () => {
    const engine = new MockAnswerEngine(0);
    const stream = vi.spyOn(engine, 'streamAnswer');
    const { session } = setup(engine, { ...DEFAULT_SETTINGS, answerLanguage: 'en' });
    await session.onSegment(seg('Spune-mi despre tine?'));
    expect(stream.mock.calls[0]![0].language).toBe('en');
  });

  it('gives the engine recent transcript as context', async () => {
    const engine = new MockAnswerEngine(0);
    const stream = vi.spyOn(engine, 'streamAnswer');
    const { session } = setup(engine);
    await session.onSegment(seg('I led the payments migration at Acme.', 'me'));
    await session.onSegment(seg('How long did that project take?'));
    expect(stream.mock.calls[0]![0].recentTranscript).toContain('Me: I led the payments migration at Acme.');
  });

  it('reports engine errors on the answer instead of throwing', async () => {
    const engine: AnswerEngine = {
      detectQuestion: async (i) => ({ isQuestion: true, question: i.candidate, language: 'en' }),
      streamAnswer: async () => {
        throw new Error('rate limited');
      },
    };
    const { session, answers } = setup(engine);
    await session.onSegment(seg('Why us?'));
    expect(answers.at(-1)).toMatchObject({ done: true, error: 'rate limited' });
  });
});
