import { decodeJson, encodeJson } from './codec';
import { LINK_TYPES, MAX_ENCODED, SCHEMAS, type LinkType, type PayloadByType } from './payloads';

/**
 * Links carry their payload in the URL fragment (`#/join?d=…`), which
 * browsers never send to a server (SPEC §10.2).
 */

export type LinkErrorCode = 'too-large' | 'malformed' | 'unsupported-version' | 'wrong-type' | 'invalid';

export class LinkError extends Error {
  readonly code: LinkErrorCode;
  constructor(code: LinkErrorCode, message: string) {
    super(message);
    this.name = 'LinkError';
    this.code = code;
  }
}

export type DecodeResult<T> = { ok: true; value: T } | { ok: false; error: LinkError };

export function isLinkType(value: string): value is LinkType {
  return (LINK_TYPES as readonly string[]).includes(value);
}

/** Validate then encode. Throws if the payload is invalid or too large for its link type. */
export async function encodePayload<T extends LinkType>(type: T, payload: PayloadByType[T]): Promise<string> {
  const schema = SCHEMAS[type][payload.v as number];
  if (!schema) throw new LinkError('unsupported-version', `No ${type} schema for v${String(payload.v)}`);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new LinkError('invalid', `Invalid ${type} payload: ${parsed.error.message}`);
  const encoded = await encodeJson(parsed.data);
  if (encoded.length > MAX_ENCODED[type]) {
    throw new LinkError(
      'too-large',
      `${type} link is ${String(encoded.length)} chars; max ${String(MAX_ENCODED[type])}`,
    );
  }
  return encoded;
}

/** Decode and validate an encoded `d=` value. Never throws. */
export async function decodePayload<T extends LinkType>(
  type: T,
  encoded: string,
): Promise<DecodeResult<PayloadByType[T]>> {
  const fail = (code: LinkErrorCode, msg: string): DecodeResult<PayloadByType[T]> => ({
    ok: false,
    error: new LinkError(code, msg),
  });
  if (encoded.length > MAX_ENCODED[type]) return fail('too-large', 'Link payload is too large');
  let raw: unknown;
  try {
    raw = await decodeJson(encoded);
  } catch (err) {
    if (err instanceof RangeError) return fail('too-large', 'Link payload inflates too large');
    return fail('malformed', 'Link payload could not be read');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return fail('malformed', 'Not an object');
  const rec = raw as Record<string, unknown>;
  if (rec.t !== type) return fail('wrong-type', `Expected a ${type} link`);
  const v = rec.v;
  const schema = typeof v === 'number' ? SCHEMAS[type][v] : undefined;
  if (!schema) return fail('unsupported-version', 'Unknown link version');
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail('invalid', parsed.error.issues.map((i) => i.message).join('; '));
  return { ok: true, value: parsed.data };
}

export interface LinkRoute {
  type: LinkType;
  encoded: string;
}

const FRAGMENT_RE = /^#\/(join|cheer|family|r)\?(.*)$/;

/** Parse `#/join?d=…`, `#/cheer?d=…`, `#/family?d=…` or `#/r?d=…`. Returns null for other fragments. */
export function parseLinkFragment(hash: string): LinkRoute | null {
  const m = FRAGMENT_RE.exec(hash);
  if (!m) return null;
  const route = m[1] ?? '';
  const d = new URLSearchParams(m[2] ?? '').get('d');
  if (d === null || d === '') return null;
  return { type: route === 'r' ? 'result' : (route as LinkType), encoded: d };
}

/** Build a shareable URL for an encoded payload, e.g. https://example.org/#/join?d=… */
export function linkUrl(base: string, type: LinkType, encoded: string): string {
  const route = type === 'result' ? 'r' : type;
  const root = base.replace(/#.*$/, '').replace(/\/?$/, '/');
  return `${root}#/${route}?d=${encoded}`;
}

export async function makeLink<T extends LinkType>(
  base: string,
  type: T,
  payload: PayloadByType[T],
): Promise<string> {
  return linkUrl(base, type, await encodePayload(type, payload));
}
