import type {
  AnswerEngine,
  AnswerInput,
  DetectQuestionInput,
  DetectQuestionResult,
} from '../../core/answerEngine';
import { readSseData } from './sse';
import { ANSWER_SYSTEM_PROMPT, DETECT_SYSTEM_PROMPT, answerUserMessage, detectUserMessage } from './prompts';

/**
 * Groq, Google Gemini and Ollama all expose an OpenAI-style chat completions
 * endpoint, so one small fetch-based client covers the three free options.
 */
export const OPENAI_COMPATIBLE_BASE_URLS = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
} as const;

const DETECT_JSON_INSTRUCTIONS =
  'Reply with only a JSON object of the form {"isQuestion": boolean, "question": string, "language": "ro" | "en"}.';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export class OpenAiCompatibleEngine implements AnswerEngine {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | null,
    private readonly model: () => string,
  ) {}

  async detectQuestion(input: DetectQuestionInput, signal?: AbortSignal): Promise<DetectQuestionResult> {
    const res = await this.post(
      {
        messages: [
          { role: 'system', content: `${DETECT_SYSTEM_PROMPT}\n\n${DETECT_JSON_INSTRUCTIONS}` },
          { role: 'user', content: detectUserMessage(input) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      },
      signal,
    );
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseDetection(body.choices?.[0]?.message?.content ?? '');
  }

  async streamAnswer(input: AnswerInput, onText: (textSoFar: string) => void, signal?: AbortSignal): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: `${ANSWER_SYSTEM_PROMPT}\n\n<resume>\n${input.resumeText || '(no resume provided)'}\n</resume>` },
      { role: 'user', content: answerUserMessage(input) },
    ];
    const res = await this.post({ messages, stream: true, temperature: 0.4 }, signal);
    if (!res.body) throw new Error('Empty response from provider');

    let text = '';
    for await (const data of readSseData(res.body)) {
      if (data === '[DONE]') break;
      const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        onText(text);
      }
    }
    return text;
  }

  private async post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.model(), ...body }),
      signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Provider returned ${res.status}: ${detail.slice(0, 300)}`);
    }
    return res;
  }
}

/** Lenient parse: small free models sometimes wrap JSON in prose or code fences. */
export function parseDetection(raw: string): DetectQuestionResult {
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    const obj = JSON.parse(match ? match[0] : raw) as Partial<DetectQuestionResult>;
    return {
      isQuestion: obj.isQuestion === true,
      question: typeof obj.question === 'string' ? obj.question : '',
      language: obj.language === 'ro' ? 'ro' : 'en',
    };
  } catch {
    return { isQuestion: false, question: '', language: 'en' };
  }
}
