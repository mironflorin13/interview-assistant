import {
  LLM_PROVIDERS,
  STT_PROVIDERS,
  type AnswerUpdate,
  type KeyedProvider,
  type LlmProvider,
  type PublicSettings,
  type Speaker,
  type SttProvider,
} from '../../shared/types';
import { AudioCapture } from './audio/capture';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const api = window.assistant;

const KEY_LABELS: Record<KeyedProvider, string> = { groq: 'Groq', gemini: 'Gemini', claude: 'Anthropic Claude' };

let settings: PublicSettings;
const capture = new AudioCapture((speaker, samples) => api.sendAudio(speaker, samples));

function setStatus(text: string): void {
  $('status').textContent = text;
}

function fillSelect(select: HTMLSelectElement, options: Record<string, { label: string }>, value: string): void {
  select.replaceChildren(
    ...Object.entries(options).map(([id, o]) => {
      const opt = new Option(o.label, id);
      opt.selected = id === value;
      return opt;
    }),
  );
}

function renderSettings(): void {
  fillSelect($('llm-provider'), LLM_PROVIDERS, settings.llmProvider);
  fillSelect($('stt-provider'), STT_PROVIDERS, settings.sttProvider);
  $<HTMLInputElement>('llm-model').value = settings.llmModel;
  $<HTMLInputElement>('llm-model').placeholder = LLM_PROVIDERS[settings.llmProvider].defaultModel;
  $<HTMLSelectElement>('answer-language').value = settings.answerLanguage;
  $<HTMLInputElement>('ollama-url').value = settings.ollamaUrl;
  $<HTMLInputElement>('whisper-url').value = settings.whisperUrl;
  $<HTMLInputElement>('whisper-server-path').value = settings.whisperServerPath;
  $<HTMLInputElement>('whisper-model-path').value = settings.whisperModelPath;
  $<HTMLTextAreaElement>('resume').value = settings.resumeText;

  $('keys').replaceChildren(
    ...(Object.keys(KEY_LABELS) as KeyedProvider[]).map((provider) => {
      const row = document.createElement('div');
      row.className = 'key-row';
      const label = document.createElement('span');
      label.textContent = `${KEY_LABELS[provider]}: ${settings.keysSet[provider] ? 'saved' : 'not set'}`;
      const input = document.createElement('input');
      input.type = 'password';
      input.placeholder = 'Paste key';
      const save = document.createElement('button');
      save.textContent = 'Save key';
      save.onclick = async () => {
        if (!input.value.trim()) return;
        settings = await api.setApiKey(provider, input.value);
        renderSettings();
      };
      const clear = document.createElement('button');
      clear.textContent = 'Remove';
      clear.onclick = async () => {
        settings = await api.clearApiKey(provider);
        renderSettings();
      };
      row.append(label, input, save, clear);
      return row;
    }),
  );
}

async function saveSettings(): Promise<void> {
  settings = await api.saveSettings({
    llmProvider: $<HTMLSelectElement>('llm-provider').value as LlmProvider,
    llmModel: $<HTMLInputElement>('llm-model').value.trim(),
    sttProvider: $<HTMLSelectElement>('stt-provider').value as SttProvider,
    answerLanguage: $<HTMLSelectElement>('answer-language').value as PublicSettings['answerLanguage'],
    ollamaUrl: $<HTMLInputElement>('ollama-url').value.trim(),
    whisperUrl: $<HTMLInputElement>('whisper-url').value.trim(),
    whisperServerPath: $<HTMLInputElement>('whisper-server-path').value.trim(),
    whisperModelPath: $<HTMLInputElement>('whisper-model-path').value.trim(),
    resumeText: $<HTMLTextAreaElement>('resume').value,
  });
  renderSettings();
  setStatus('Settings saved');
}

async function start(): Promise<void> {
  try {
    await api.startSession();
    if (settings.sttProvider !== 'mock') await capture.start();
    setStatus(settings.sttProvider === 'mock' ? 'Demo mode: type lines below' : 'Listening');
    $<HTMLButtonElement>('start').disabled = true;
    $<HTMLButtonElement>('stop').disabled = false;
  } catch (err) {
    setStatus(`Could not start: ${err instanceof Error ? err.message : String(err)}`);
    await capture.stop();
  }
}

async function stop(): Promise<void> {
  await capture.stop();
  await api.stopSession();
  setStatus('Idle');
  $<HTMLButtonElement>('start').disabled = false;
  $<HTMLButtonElement>('stop').disabled = true;
}

function answerItem(questionId: string): HTMLLIElement {
  let item = document.querySelector<HTMLLIElement>(`[data-question="${questionId}"]`);
  if (!item) {
    item = document.createElement('li');
    item.dataset.question = questionId;
    item.innerHTML = '<div class="question"></div><div class="answer"></div>';
    $('answers').prepend(item);
  }
  return item;
}

function renderAnswer(update: AnswerUpdate): void {
  const item = answerItem(update.questionId);
  const answer = item.querySelector('.answer')!;
  answer.textContent = update.error ? `Error: ${update.error}` : update.text;
  answer.classList.toggle('error', !!update.error);
  item.classList.toggle('streaming', !update.done);
}

async function init(): Promise<void> {
  settings = await api.getSettings();
  renderSettings();

  $('toggle-settings').onclick = () => ($('settings').hidden = !$('settings').hidden);
  $('save-settings').onclick = () => void saveSettings();
  $('llm-provider').onchange = () => {
    $<HTMLInputElement>('llm-model').placeholder =
      LLM_PROVIDERS[$<HTMLSelectElement>('llm-provider').value as LlmProvider].defaultModel;
  };
  $('start').onclick = () => void start();
  $('stop').onclick = () => void stop();
  $<HTMLFormElement>('simulate').onsubmit = (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('simulate-text');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    void api.simulateUtterance($<HTMLSelectElement>('simulate-speaker').value as Speaker, text);
  };

  api.onTranscript((segment) => {
    let li = document.querySelector<HTMLLIElement>(`[data-segment="${segment.id}"]`);
    if (!li) {
      li = document.createElement('li');
      li.dataset.segment = segment.id;
      $('transcript').append(li);
    }
    li.className = `${segment.speaker}${segment.isFinal ? '' : ' interim'}`;
    li.textContent = `${segment.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${segment.text}`;
    li.scrollIntoView({ block: 'end' });
  });
  api.onQuestion((q) => {
    answerItem(q.id).querySelector('.question')!.textContent = `${q.language.toUpperCase()} · ${q.text}`;
  });
  api.onAnswer(renderAnswer);
}

void init();
