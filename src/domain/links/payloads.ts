import { z } from 'zod';
import { OUTCOMES } from '../scoring/score';
import { GroupSchema, KindSchema, SCAM_GROUPS, TacticSchema } from '../scenario/schema';
import { isLocalDate } from '../time/dates';

/**
 * Link payload schemas (SPEC §9). Link formats are versioned forever: a v1
 * payload must keep decoding in every future release (tests/fixtures/links).
 * Every payload is untrusted input, so every string is length-capped and
 * rendered only as text.
 */

/** Names typed by people: trimmed, 1–30 chars, no control characters. */
const PersonName = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[^\p{Cc}\p{Cf}]+$/u, 'No control characters');

const ShortText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}]+$/u, 'No control characters');

export const ScamGroupSchema = GroupSchema.exclude(['real']);

export const JoinLinkV1Schema = z.strictObject({
  v: z.literal(1),
  t: z.literal('join'),
  /** What the coach is called: "Arjun". */
  coach: PersonName,
  /** How callers address the player: "Paati". */
  address: PersonName,
  /** Optional player name, shown on result cards. */
  player: PersonName.optional(),
  /** Scam groups the coach enabled. Legitimate calls are always on. */
  cats: z.array(ScamGroupSchema).min(1).max(SCAM_GROUPS.length),
  legitRate: z.number().min(0.3).max(0.5).optional(),
});
export type JoinLinkV1 = z.infer<typeof JoinLinkV1Schema>;

/** Allow-listed cheer containers (SPEC §10.2). Parameters other than `codecs` are rejected. */
export const CHEER_MIME_RE = /^audio\/(?:webm|mp4|ogg)(?:;codecs="?(?:opus|mp4a\.40\.(?:2|5))"?)?$/;

export function normaliseMime(mime: string): string {
  return mime.toLowerCase().replace(/\s+/g, '');
}

/** ≈ 2.5 s at 12 kbps is ~3.75 KB; 7,000 base64 chars (~5.2 KB) leaves headroom for container overhead. */
export const MAX_CHEER_B64 = 7000;

export const CheerLinkV1Schema = z.strictObject({
  v: z.literal(1),
  t: z.literal('cheer'),
  from: PersonName,
  mime: z
    .string()
    .max(48)
    .transform(normaliseMime)
    .refine((m) => CHEER_MIME_RE.test(m), 'Unsupported audio type'),
  b64: z
    .string()
    .min(16)
    .max(MAX_CHEER_B64)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Audio must be base64'),
  /** Text fallback and caption: "Nice one, Paati!" */
  text: ShortText(80).optional(),
});
export type CheerLinkV1 = z.infer<typeof CheerLinkV1Schema>;

/** The guided family-call form (SPEC F8, DESIGN.md "Family call builder"). */
export const FamilyCallDraftSchema = z.strictObject({
  kind: KindSchema,
  /** "Caller says they are…": "Sam", "Officer Grant". */
  caller: ShortText(40),
  /** First thing they say. */
  opener: ShortText(200),
  /** Scam: the warning sign. Legit: the middle of the call. */
  warning: ShortText(200),
  /** Scam: what they ask for. Legit: how they say goodbye. */
  ask: ShortText(200),
  /** Tactics stamped on the warning and ask lines (scam only). */
  warningTactics: z.array(TacticSchema).min(1).max(3).optional(),
  askTactics: z.array(TacticSchema).min(1).max(3).optional(),
  /** One sentence of advice, ≤ 140 chars. */
  advice: ShortText(140),
});
export type FamilyCallDraft = z.infer<typeof FamilyCallDraftSchema>;

export const FamilyLinkV1Schema = z.strictObject({
  v: z.literal(1),
  t: z.literal('family'),
  from: PersonName,
  /** Random id chosen by the coach's device, so re-opening a link doesn't duplicate it. */
  id: z.string().regex(/^[a-z0-9]{8,16}$/),
  call: FamilyCallDraftSchema,
});
export type FamilyLinkV1 = z.infer<typeof FamilyLinkV1Schema>;

const LocalDateSchema = z.string().refine(isLocalDate, 'Not a YYYY-MM-DD date');
const Ms = z
  .number()
  .int()
  .min(0)
  .max(60 * 60 * 1000);

export const ResultCardV1Schema = z.strictObject({
  v: z.literal(1),
  t: z.literal('result'),
  /** Player name or address term: "Paati". */
  name: PersonName,
  date: LocalDateSchema,
  /** Noun phrase from the template: "a fake bank call". */
  title: ShortText(48),
  kind: KindSchema,
  outcome: z.enum(OUTCOMES),
  /** Milliseconds from answer to the player's action. */
  tAction: Ms.optional(),
  /** Milliseconds from answer to the end of the scammer's ask. */
  tAsk: Ms.optional(),
  streak: z.number().int().min(0).max(100_000),
  rate30: z.number().min(0).max(1).optional(),
});
export type ResultCardV1 = z.infer<typeof ResultCardV1Schema>;

export const LINK_TYPES = ['join', 'cheer', 'family', 'result'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export interface PayloadByType {
  join: JoinLinkV1;
  cheer: CheerLinkV1;
  family: FamilyLinkV1;
  result: ResultCardV1;
}

/** Schemas per type and version. Add new versions here; never remove old ones. */
export const SCHEMAS: { [T in LinkType]: Record<number, z.ZodType<PayloadByType[T]>> } = {
  join: { 1: JoinLinkV1Schema },
  cheer: { 1: CheerLinkV1Schema },
  family: { 1: FamilyLinkV1Schema },
  result: { 1: ResultCardV1Schema },
};

/** Ceilings on the encoded `d=` value, in characters (SPEC §10.2). */
export const MAX_ENCODED: Record<LinkType, number> = {
  join: 2048,
  cheer: 8192,
  family: 6144,
  result: 1024,
};

/** The join link must stay QR-sized (AC-F8-1): the full URL ≤ 1,000 chars. */
export const MAX_JOIN_URL = 1000;
