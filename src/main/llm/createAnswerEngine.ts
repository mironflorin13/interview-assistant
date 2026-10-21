import type { AnswerEngine } from '../../core/answerEngine';
import { MockAnswerEngine } from '../../core/mockAnswerEngine';
import { LLM_PROVIDERS, type AppSettings, type KeyedProvider } from '../../shared/types';
import { ClaudeAnswerEngine } from './claudeAnswerEngine';
import { OPENAI_COMPATIBLE_BASE_URLS, OpenAiCompatibleEngine } from './openAiCompatibleEngine';

export function createAnswerEngine(
  settings: () => AppSettings,
  getKey: (provider: KeyedProvider) => string | null,
): AnswerEngine {
  const s = settings();
  const model = () => settings().llmModel || LLM_PROVIDERS[settings().llmProvider].defaultModel;
  switch (s.llmProvider) {
    case 'mock':
      return new MockAnswerEngine();
    case 'ollama':
      return new OpenAiCompatibleEngine(`${s.ollamaUrl.replace(/\/$/, '')}/v1`, null, model);
    case 'groq':
    case 'gemini':
      return new OpenAiCompatibleEngine(OPENAI_COMPATIBLE_BASE_URLS[s.llmProvider], requireKey(getKey, s.llmProvider), model);
    case 'claude':
      return new ClaudeAnswerEngine(requireKey(getKey, 'claude'), model);
  }
}

function requireKey(getKey: (provider: KeyedProvider) => string | null, provider: KeyedProvider): string {
  const key = getKey(provider);
  if (!key) throw new Error(`No API key set for ${LLM_PROVIDERS[provider].label}. Add one in Settings.`);
  return key;
}
