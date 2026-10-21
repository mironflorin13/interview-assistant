# Interview Assistant

A Windows desktop app that listens to a live job interview (Zoom, Teams, Meet or any other meeting app), transcribes it, spots the interviewer's questions and suggests answers based on your resume. Interviews can be in **Romanian or English**.

> Status: skeleton. The full pipeline runs end to end in demo mode; real transcription and AI answers work once you pick providers in Settings.

## How it works

```
Meeting app audio ──(WASAPI loopback)──┐
                                       ├─► 16 kHz PCM ─► Speech-to-text ─► transcript
Your microphone ───────────────────────┘                                       │
                                                                               ▼
                         suggested answer ◄─ LLM: answer ◄─ LLM: is it a question? ◄─ local pre-filter
```

* System audio is the interviewer and the microphone is you, so we know who is speaking without diarization.
* Only interviewer lines that look like a question (cheap local check for Romanian and English) are sent to the LLM.
* Answers stream into the window as they are written, in the question's language (or a fixed one you choose).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Providers (switch in Settings)

| Part | Options | Cost |
| --- | --- | --- |
| Speech-to-text | **Local Whisper** (whisper.cpp, default), Groq Whisper, demo | Local: free, offline. Groq: free tier |
| Question detection and answers | Groq, Google Gemini, Ollama (local), Anthropic Claude, demo | Groq/Gemini: free tiers. Ollama: free, local. Claude: paid |

API keys are typed into Settings, encrypted on your PC with Windows DPAPI (Electron `safeStorage`), and only sent to that provider. They are never stored in this repository. For development you can also set `GROQ_API_KEY`, `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`.

### Setting up free local Whisper

1. Download a Windows build of [whisper.cpp](https://github.com/ggml-org/whisper.cpp/releases) (it contains `whisper-server.exe`).
2. Download a multilingual model, for example `ggml-large-v3-turbo.bin` (best quality) or `ggml-small.bin` (faster on slow PCs), from [huggingface.co/ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/tree/main). Do not use the `.en` models; they only understand English.
3. In Settings, set the path to `whisper-server.exe` and to the model. The app starts the server when you press **Start listening**. Or run it yourself and leave the path empty:
   `whisper-server.exe --model ggml-large-v3-turbo.bin --port 8178 --language auto`

### Getting API keys

* **Groq** (free): sign in at [console.groq.com](https://console.groq.com), open **API Keys**, create a key. One key covers both Whisper transcription and answers.
* **Google Gemini** (free tier): [aistudio.google.com](https://aistudio.google.com), **Get API key**.
* **Anthropic Claude** (paid, later): sign in at [console.anthropic.com](https://console.anthropic.com), add billing under **Settings → Billing** (separate from a claude.ai subscription), then **Settings → API Keys → Create Key**. Copy it once; it is not shown again.
* **Ollama**: no key. Install [Ollama](https://ollama.com), run `ollama pull qwen2.5:7b`, choose Ollama in Settings.

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # start the app with hot reload
npm test           # unit tests (no network, no keys)
npm run typecheck
npm run dist:win   # build the Windows installer into release/
```

With the default demo AI you can test without any keys: type a line such as `Spune-mi despre tine?` in the box under the transcript.

System audio capture uses Windows loopback, so **Start listening** with real audio needs Windows. Everything else, including tests and the typed demo, runs anywhere.

## Privacy and consent

Recording a call can require the other party's consent depending on where you and they are, and some companies forbid assistance tools in interviews. Check before you use it.
