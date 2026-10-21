import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AnswerUpdate, type DetectedQuestion, type TranscriptSegment } from '../shared/types';
import type { AssistantApi } from './api';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: AssistantApi = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.saveSettings, patch),
  setApiKey: (provider, key) => ipcRenderer.invoke(IPC.setApiKey, provider, key),
  clearApiKey: (provider) => ipcRenderer.invoke(IPC.clearApiKey, provider),
  startSession: () => ipcRenderer.invoke(IPC.startSession),
  stopSession: () => ipcRenderer.invoke(IPC.stopSession),
  sendAudio: (speaker, samples) => ipcRenderer.send(IPC.audioChunk, speaker, samples),
  simulateUtterance: (speaker, text) => ipcRenderer.invoke(IPC.simulateUtterance, speaker, text),
  onTranscript: (l) => subscribe<TranscriptSegment>(IPC.onTranscript, l),
  onQuestion: (l) => subscribe<DetectedQuestion>(IPC.onQuestion, l),
  onAnswer: (l) => subscribe<AnswerUpdate>(IPC.onAnswer, l),
};

contextBridge.exposeInMainWorld('assistant', api);
