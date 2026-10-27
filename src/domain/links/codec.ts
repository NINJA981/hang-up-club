/**
 * Link payload codec: JSON → deflate-raw (native CompressionStream) → base64url.
 * Works in browsers and Node ≥ 18 with no dependencies.
 */

/** Hard ceiling on decompressed size, so a tiny link cannot inflate into a memory bomb. */
export const MAX_INFLATED_BYTES = 64 * 1024;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const B64URL_RE = /^[A-Za-z0-9_-]*$/;

export function base64UrlToBytes(text: string): Uint8Array {
  if (!B64URL_RE.test(text) || text.length % 4 === 1) throw new SyntaxError('Not base64url');
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pump(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new RangeError('Payload too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** The DOM typings disagree about BufferSource vs Uint8Array here; the runtime types are the same. */
function through(
  source: ReadableStream<Uint8Array>,
  transform: GenericTransformStream,
): ReadableStream<Uint8Array> {
  return source.pipeThrough<Uint8Array>(transform);
}

export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return pump(through(streamOf(bytes), new CompressionStream('deflate-raw')), Number.MAX_SAFE_INTEGER);
}

export async function inflateRaw(bytes: Uint8Array, limit = MAX_INFLATED_BYTES): Promise<Uint8Array> {
  return pump(through(streamOf(bytes), new DecompressionStream('deflate-raw')), limit);
}

export async function encodeJson(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  return bytesToBase64Url(await deflateRaw(new TextEncoder().encode(json)));
}

export async function decodeJson(text: string, limit = MAX_INFLATED_BYTES): Promise<unknown> {
  const inflated = await inflateRaw(base64UrlToBytes(text), limit);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated)) as unknown;
}
