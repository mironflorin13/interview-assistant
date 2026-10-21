import type { SegmentSink, SpeechToText } from '../../core/speechToText';
import { STT_PROVIDERS, type AppSettings, type KeyedProvider } from '../../shared/types';
import { WhisperHttpStt, groqEndpoint, whisperCppEndpoint } from './whisperHttpStt';

/** Ignores audio. Transcript lines come from the dev "simulate" box instead. */
class MockSpeechToText implements SpeechToText {
  pushAudio(): void {}
  async stop(): Promise<void> {}
}

export function createSpeechToText(
  settings: AppSettings,
  getKey: (provider: KeyedProvider) => string | null,
  sink: SegmentSink,
  onError: (err: Error) => void,
): SpeechToText {
  switch (settings.sttProvider) {
    case 'mock':
      return new MockSpeechToText();
    case 'local-whisper':
      return new WhisperHttpStt(whisperCppEndpoint(settings.whisperUrl), sink, onError);
    case 'groq': {
      const key = getKey('groq');
      if (!key) throw new Error('No Groq API key set. Add one in Settings.');
      return new WhisperHttpStt(groqEndpoint(key, settings.sttModel || STT_PROVIDERS.groq.defaultModel), sink, onError);
    }
  }
}
