import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, type AppSettings, type KeyedProvider, type PublicSettings } from '../shared/types';

interface StoredSettings extends AppSettings {
  /** API keys encrypted with Electron safeStorage (DPAPI on Windows), base64 encoded. */
  encryptedKeys: Partial<Record<KeyedProvider, string>>;
}

const ENV_KEYS: Record<KeyedProvider, string> = {
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
};

/**
 * Settings live in the user's AppData folder, outside the repo. API keys are
 * encrypted at rest and only ever read in the main process. For development,
 * environment variables (GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY) are
 * used when no key is saved.
 */
export class SettingsStore {
  private readonly file = join(app.getPath('userData'), 'settings.json');
  private data: StoredSettings;

  constructor() {
    this.data = { ...DEFAULT_SETTINGS, encryptedKeys: {} };
    if (existsSync(this.file)) {
      try {
        this.data = { ...this.data, ...(JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StoredSettings>) };
      } catch {
        // A corrupt file falls back to defaults rather than blocking startup.
      }
    }
  }

  get(): AppSettings {
    const { encryptedKeys: _keys, ...settings } = this.data;
    return settings;
  }

  getPublic(): PublicSettings {
    return {
      ...this.get(),
      keysSet: { groq: !!this.getKey('groq'), gemini: !!this.getKey('gemini'), claude: !!this.getKey('claude') },
    };
  }

  save(patch: Partial<AppSettings>): void {
    const allowed: (keyof AppSettings)[] = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];
    for (const key of allowed) {
      if (patch[key] !== undefined) (this.data as unknown as Record<string, unknown>)[key] = patch[key];
    }
    this.persist();
  }

  getKey(provider: KeyedProvider): string | null {
    const stored = this.data.encryptedKeys[provider];
    if (stored && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(stored, 'base64'));
      } catch {
        return null;
      }
    }
    return process.env[ENV_KEYS[provider]] || null;
  }

  setKey(provider: KeyedProvider, key: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available, so the key cannot be saved safely.');
    }
    this.data.encryptedKeys[provider] = safeStorage.encryptString(key.trim()).toString('base64');
    this.persist();
  }

  clearKey(provider: KeyedProvider): void {
    delete this.data.encryptedKeys[provider];
    this.persist();
  }

  private persist(): void {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
  }
}
