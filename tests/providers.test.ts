import { describe, expect, it } from 'vitest';
import { parseDetection } from '../src/main/llm/openAiCompatibleEngine';
import { readSseData } from '../src/main/llm/sse';
import { cleanTranscript } from '../src/main/stt/whisperHttpStt';

describe('parseDetection', () => {
  it('reads plain JSON', () => {
    expect(parseDetection('{"isQuestion": true, "question": "De ce noi?", "language": "ro"}')).toEqual({
      isQuestion: true,
      question: 'De ce noi?',
      language: 'ro',
    });
  });
  it('reads JSON wrapped in a code fence', () => {
    expect(parseDetection('```json\n{"isQuestion": false, "question": "", "language": "en"}\n```').isQuestion).toBe(false);
  });
  it('treats garbage as not a question', () => {
    expect(parseDetection('sure!').isQuestion).toBe(false);
  });
});

describe('readSseData', () => {
  it('yields data lines split across chunks', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: {"a":1}\n\nda'));
        controller.enqueue(enc.encode('ta: {"a":2}\r\n\ndata: [DONE]'));
        controller.close();
      },
    });
    const out: string[] = [];
    for await (const d of readSseData(body)) out.push(d);
    expect(out).toEqual(['{"a":1}', '{"a":2}', '[DONE]']);
  });
});

describe('cleanTranscript', () => {
  it('drops Whisper non-speech markers', () => {
    expect(cleanTranscript(' [BLANK_AUDIO] ')).toBe('');
    expect(cleanTranscript('(muzică)')).toBe('');
  });
  it('keeps and tidies real speech', () => {
    expect(cleanTranscript('  Spune-mi   despre tine. ')).toBe('Spune-mi despre tine.');
  });
});
