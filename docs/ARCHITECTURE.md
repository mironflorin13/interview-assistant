# Architecture

## Stack

* **Electron + TypeScript**, built with electron-vite, packaged with electron-builder (NSIS installer for Windows).
* **No native modules.** System audio uses Electron's `setDisplayMediaRequestHandler` with `audio: 'loopback'` (WASAPI loopback on Windows); the mic uses `getUserMedia`. An AudioWorklet downsamples both to 16 kHz mono Int16 PCM.
* **Vitest** for unit tests, GitHub Actions CI on `windows-latest`.
* Plain DOM UI for now; can move to a framework when the UI grows.

## Layout

```
src/
  shared/types.ts          types, provider lists, IPC channel names
  core/                    pure logic, no Electron, fully unit tested
    interviewSession.ts    transcript → question detection → streamed answer
    questionHeuristics.ts  cheap RO/EN "is this a question?" filter and language guess
    utteranceChunker.ts    energy-based voice activity split + WAV encoding
    answerEngine.ts        LLM interface (detectQuestion, streamAnswer)
    speechToText.ts        STT interface (pushAudio, stop)
    mockAnswerEngine.ts    offline LLM used for demo mode and tests
  main/                    Electron main process
    index.ts               window, loopback capture handler, IPC, session lifecycle
    settingsStore.ts       settings in %APPDATA%, API keys encrypted with safeStorage
    llm/                   Claude (official SDK) and OpenAI-compatible (Groq, Gemini, Ollama) engines
    stt/                   Whisper over HTTP (local whisper.cpp or Groq), whisper-server launcher
  preload/                 contextBridge API: the only thing the UI can call
  renderer/                UI and audio capture
tests/                     unit tests
```

## Decisions

* **Two pluggable interfaces.** `AnswerEngine` (LLM) and `SpeechToText` are chosen independently in Settings, so free tiers can be used for testing and Claude later without code changes.
* **Speaker from the audio source**, not diarization: loopback = interviewer, mic = me. Only interviewer speech triggers answers.
* **Two-stage detection.** A local regex filter for Romanian and English question shapes runs on every final interviewer line; only candidates go to the LLM, which decides and rewrites the question into a self-contained sentence using recent context.
* **Whisper is clip-based**, so audio is cut on ~0.7 s of silence (max 15 s per clip). Whisper auto-detects Romanian vs English per clip; a bilingual prompt hint helps with mixed vocabulary.
* **Keys stay in the main process.** The renderer only learns whether a key is set. Context isolation and the renderer sandbox are on.
* **Claude engine** uses the official `@anthropic-ai/sdk`: structured output for detection, streaming for answers, the resume cached as a stable system-prompt block, server-side refusal fallback enabled. Default model `claude-opus-5-5`, editable in Settings.

## Next steps (proposed threads)

1. Audio capture hardening on real Windows meetings (device changes, echo when not using headphones).
2. Transcription quality for Romanian: compare whisper.cpp model sizes for latency vs accuracy.
3. Answer quality: prompts, resume import from PDF/DOCX, notes and summary after the call.
4. UI: compact always-on-top overlay mode.
5. Installer, auto-update, code signing.
