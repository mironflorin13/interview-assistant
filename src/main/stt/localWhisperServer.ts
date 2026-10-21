import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Starts and stops a whisper.cpp `whisper-server.exe` that the user downloaded,
 * so local transcription works with one click. If no executable is configured,
 * the app assumes the user runs the server themselves at the configured URL.
 */
export class LocalWhisperServer {
  private child: ChildProcess | null = null;

  async start(executablePath: string, modelPath: string, url: string): Promise<void> {
    if (this.child) return;
    if (!existsSync(executablePath)) throw new Error(`whisper-server not found at ${executablePath}`);
    if (!existsSync(modelPath)) throw new Error(`Whisper model not found at ${modelPath}`);

    const { hostname, port } = new URL(url);
    this.child = spawn(
      executablePath,
      ['--model', modelPath, '--host', hostname, '--port', port || '8178', '--language', 'auto'],
      { stdio: 'ignore', windowsHide: true },
    );
    this.child.once('exit', () => (this.child = null));
    await waitForServer(url, 30_000);
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`whisper-server did not start at ${url} within ${timeoutMs / 1000}s`);
}
