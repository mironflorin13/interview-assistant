/** Yields the `data:` payload of each server-sent event in a fetch response body. */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) yield line.slice(5).trimStart();
      }
    }
    const last = buffer.trim();
    if (last.startsWith('data:')) yield last.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}
