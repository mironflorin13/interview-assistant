import { describe, expect, it } from 'vitest';
import { UtteranceChunker, encodeWav } from '../src/core/utteranceChunker';

const RATE = 16000;
const tone = (ms: number) => Int16Array.from({ length: (RATE * ms) / 1000 }, (_, i) => Math.round(Math.sin(i / 5) * 8000));
const silence = (ms: number) => new Int16Array((RATE * ms) / 1000);

describe('UtteranceChunker', () => {
  it('emits one utterance after speech followed by silence', () => {
    const out: Int16Array[] = [];
    const c = new UtteranceChunker((u) => out.push(u));
    c.push(silence(500));
    c.push(tone(1000));
    c.push(silence(1000));
    expect(out).toHaveLength(1);
    // Leading silence is dropped, speech plus the trailing silence window is kept.
    expect(out[0]!.length).toBe((RATE * 1700) / 1000);
  });

  it('splits long monologues at the max length', () => {
    const out: Int16Array[] = [];
    const c = new UtteranceChunker((u) => out.push(u), { maxUtteranceMs: 2000 });
    c.push(tone(5000));
    expect(out).toHaveLength(2);
  });

  it('drops clicks shorter than the minimum speech length', () => {
    const out: Int16Array[] = [];
    const c = new UtteranceChunker((u) => out.push(u));
    c.push(tone(100));
    c.push(silence(1000));
    c.flush();
    expect(out).toHaveLength(0);
  });
});

describe('encodeWav', () => {
  it('writes a 44 byte header followed by the samples', () => {
    const wav = encodeWav(new Int16Array([1, -1, 2]));
    expect(wav.length).toBe(44 + 6);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(RATE);
    expect(new DataView(wav.buffer).getInt16(46, true)).toBe(-1);
  });
});
