import { describe, expect, it } from 'vitest';
import { guessLanguage, looksLikeQuestion } from '../src/core/questionHeuristics';

describe('looksLikeQuestion', () => {
  it.each([
    'Tell me about yourself.',
    'What was your biggest challenge in your last role',
    'Can you walk me through your CV?',
    'Spune-mi despre tine.',
    'De ce vrei să lucrezi la noi',
    'Care a fost cel mai dificil proiect?',
    'Povestește-mi o situație în care ai greșit',
    'Ai lucrat cu React?',
  ])('accepts %s', (text) => {
    expect(looksLikeQuestion(text)).toBe(true);
  });

  it.each(['Great, thank you.', 'Mulțumesc frumos.', 'ok', 'We are a team of twelve engineers.'])(
    'rejects %s',
    (text) => {
      expect(looksLikeQuestion(text)).toBe(false);
    },
  );
});

describe('guessLanguage', () => {
  it('detects Romanian from diacritics', () => {
    expect(guessLanguage('Câți ani de experiență ai?')).toBe('ro');
  });
  it('detects Romanian without diacritics', () => {
    expect(guessLanguage('Spune-mi despre proiect si experienta ta')).toBe('ro');
  });
  it('defaults to English', () => {
    expect(guessLanguage('Tell me about the project you are proud of')).toBe('en');
  });
});
