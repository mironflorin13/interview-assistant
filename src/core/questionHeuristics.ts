import type { Language } from '../shared/types';

// Cheap, local pre-filter that runs on every final interviewer segment. Only
// segments that pass it are sent to Claude for the real decision, which keeps
// latency and cost down. It errs on the side of letting things through.

const EN_STARTERS = [
  'what', 'why', 'how', 'when', 'where', 'who', 'whom', 'which', 'whose',
  'can you', 'could you', 'would you', 'will you', 'do you', 'did you', 'have you',
  'are you', 'were you', 'is there', 'is it', 'tell me', 'tell us', 'describe',
  'walk me through', 'walk us through', 'explain', 'give me an example', 'share',
];

const RO_STARTERS = [
  'ce', 'de ce', 'cum', 'când', 'cand', 'unde', 'cine', 'care', 'cât', 'cat', 'câți', 'cati',
  'poți', 'poti', 'puteți', 'puteti', 'ai', 'aveți', 'aveti', 'ești', 'esti', 'sunteți', 'sunteti',
  'spune-mi', 'spuneți-mi', 'spuneti-mi', 'spune-ne', 'spuneți-ne', 'spuneti-ne',
  'descrie', 'descrieți', 'descrieti', 'povestește', 'povesteste', 'povestiți', 'povestiti',
  'explică', 'explica', 'explicați', 'explicati', 'dă-mi un exemplu', 'da-mi un exemplu',
];

const RO_DIACRITICS = /[ăâîșşțţ]/i;
const RO_COMMON_WORDS = new Set([
  'și', 'si', 'este', 'sunt', 'pentru', 'care', 'mai', 'despre', 'proiect', 'experiența',
  'experienta', 'dumneavoastră', 'dumneavoastra', 'tău', 'tau', 'ta', 'în', 'din', 'cu', 'un', 'o',
  'de', 'ce', 'cum', 'unde', 'cine', 'vrei', 'acest', 'această', 'aceasta', 'noi', 'la', 'pe', 'ai',
  'fost', 'să', 'sa',
]);
const EN_COMMON_WORDS = new Set([
  'the', 'and', 'is', 'are', 'you', 'your', 'for', 'about', 'with', 'what', 'have', 'do', 'tell',
]);

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/^[\s"'„“(-]+/, '');
}

function startsWithAny(text: string, starters: string[]): boolean {
  return starters.some((s) => text === s || [' ', ',', '-'].some((sep) => text.startsWith(s + sep)));
}

export function looksLikeQuestion(text: string): boolean {
  const t = normalize(text);
  if (t.length < 4) return false;
  if (t.endsWith('?')) return true;
  return startsWithAny(t, EN_STARTERS) || startsWithAny(t, RO_STARTERS);
}

/** Best-effort language guess for when the STT provider does not report one. */
export function guessLanguage(text: string): Language {
  if (RO_DIACRITICS.test(text)) return 'ro';
  const words = normalize(text).split(/[^\p{L}-]+/u).filter(Boolean);
  let ro = 0;
  let en = 0;
  for (const w of words) {
    if (RO_COMMON_WORDS.has(w)) ro++;
    if (EN_COMMON_WORDS.has(w)) en++;
  }
  return ro > en ? 'ro' : 'en';
}
