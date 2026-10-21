import { BrowserWindow, app, desktopCapturer, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { InterviewSession } from '../core/interviewSession';
import type { SpeechToText } from '../core/speechToText';
import { IPC, type AppSettings, type KeyedProvider, type Speaker } from '../shared/types';
import { createAnswerEngine } from './llm/createAnswerEngine';
import { SettingsStore } from './settingsStore';
import { createSpeechToText } from './stt/createSpeechToText';
import { LocalWhisperServer } from './stt/localWhisperServer';

let mainWindow: BrowserWindow | null = null;
let settings: SettingsStore;
let interview: InterviewSession | null = null;
let stt: SpeechToText | null = null;
let manualSegmentId = 1;
const whisperServer = new LocalWhisperServer();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Interview Assistant',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // System audio capture: when the renderer calls getDisplayMedia, hand it the
  // primary screen with WASAPI loopback audio (Windows). The video track is
  // discarded by the renderer; we only want what the meeting app plays.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const [screen] = await desktopCapturer.getSources({ types: ['screen'] });
    callback(screen ? { video: screen, audio: 'loopback' } : {});
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function getKey(provider: KeyedProvider): string | null {
  return settings.getKey(provider);
}

async function startSession(): Promise<void> {
  await stopSession();
  const current = () => settings.get();
  const s = current();
  if (s.sttProvider === 'local-whisper' && s.whisperServerPath) {
    await whisperServer.start(s.whisperServerPath, s.whisperModelPath, s.whisperUrl);
  }
  const engine = createAnswerEngine(current, getKey);
  const session = new InterviewSession(engine, current, {
    transcript: (s) => send(IPC.onTranscript, s),
    question: (q) => send(IPC.onQuestion, q),
    answer: (a) => send(IPC.onAnswer, a),
  });
  stt = createSpeechToText(
    current(),
    getKey,
    (segment) => void session.onSegment(segment).catch(reportError),
    reportError,
  );
  interview = session;
}

async function stopSession(): Promise<void> {
  interview?.stop();
  interview = null;
  await stt?.stop();
  stt = null;
}

function reportError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  send(IPC.onAnswer, { questionId: 'error', text: '', done: true, error: message });
}

function registerIpc(): void {
  ipcMain.handle(IPC.getSettings, () => settings.getPublic());
  ipcMain.handle(IPC.saveSettings, (_e, patch: Partial<AppSettings>) => {
    settings.save(patch);
    return settings.getPublic();
  });
  ipcMain.handle(IPC.setApiKey, (_e, provider: KeyedProvider, key: string) => {
    settings.setKey(provider, key);
    return settings.getPublic();
  });
  ipcMain.handle(IPC.clearApiKey, (_e, provider: KeyedProvider) => {
    settings.clearKey(provider);
    return settings.getPublic();
  });
  ipcMain.handle(IPC.startSession, () => startSession());
  ipcMain.handle(IPC.stopSession, () => stopSession());
  ipcMain.on(IPC.audioChunk, (_e, speaker: Speaker, samples: Int16Array) => {
    stt?.pushAudio(speaker, samples);
  });
  // Lets you test detection and answers by typing what the interviewer "said".
  ipcMain.handle(IPC.simulateUtterance, async (_e, speaker: Speaker, text: string) => {
    if (!interview) await startSession();
    await interview!.onSegment({
      id: `typed-${manualSegmentId++}`,
      speaker,
      text,
      isFinal: true,
      startedAt: Date.now(),
    });
  });
}

app.whenReady().then(() => {
  settings = new SettingsStore();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void stopSession();
  whisperServer.stop();
  if (process.platform !== 'darwin') app.quit();
});
