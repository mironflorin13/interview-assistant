import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type {
  AnswerEngine,
  AnswerInput,
  DetectQuestionInput,
  DetectQuestionResult,
} from '../../core/answerEngine';
import { ANSWER_SYSTEM_PROMPT, DETECT_SYSTEM_PROMPT, answerUserMessage, detectUserMessage } from './prompts';

const DetectionSchema = z.object({
  isQuestion: z.boolean(),
  question: z.string(),
  language: z.enum(['ro', 'en']),
});

export class ClaudeAnswerEngine implements AnswerEngine {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: () => string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async detectQuestion(input: DetectQuestionInput, signal?: AbortSignal): Promise<DetectQuestionResult> {
    const response = await this.client.messages.parse(
      {
        model: this.model(),
        // Short structured verdict; low effort keeps it fast.
        max_tokens: 2048,
        output_config: { effort: 'low', format: zodOutputFormat(DetectionSchema) },
        system: DETECT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: detectUserMessage(input) }],
      },
      { signal },
    );
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return { isQuestion: false, question: '', language: 'en' };
    }
    return response.parsed_output;
  }

  async streamAnswer(input: AnswerInput, onText: (textSoFar: string) => void, signal?: AbortSignal): Promise<string> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model(),
        max_tokens: 8000,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [
          // Stable prefix first so the resume can be cached across questions.
          { type: 'text', text: ANSWER_SYSTEM_PROMPT },
          {
            type: 'text',
            text: `<resume>\n${input.resumeText || '(no resume provided)'}\n</resume>`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: answerUserMessage(input) }],
      },
      { signal },
    );

    let text = '';
    stream.on('text', (delta) => {
      text += delta;
      onText(text);
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new Error('Claude declined to answer this question.');
    }
    return text;
  }
}
