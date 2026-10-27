import { z } from 'zod';

/** SPEC §5.3: the ten red-flag tactics. */
export const TACTICS = [
  'urgency',
  'authority',
  'fear',
  'secrecy',
  'unusual-payment',
  'code-request',
  'remote-access',
  'personal-info',
  'too-good',
  'isolation',
] as const;
export type Tactic = (typeof TACTICS)[number];
export const TacticSchema = z.enum(TACTICS);

/** Plain-language player labels (SPEC §5.3). */
export const TACTIC_LABELS: Record<Tactic, string> = {
  urgency: "They're rushing you",
  authority: "Says they're official",
  fear: 'Threatens you',
  secrecy: 'Wants it kept secret',
  'unusual-payment': 'Strange way to pay',
  'code-request': 'Asks for a code',
  'remote-access': 'Wants into your computer',
  'personal-info': 'Asks for private numbers',
  'too-good': 'Too good to be true',
  isolation: 'Keeps you on the line',
};

export const KINDS = ['scam', 'legit'] as const;
export type Kind = (typeof KINDS)[number];
export const KindSchema = z.enum(KINDS);

/**
 * Coach-facing scenario groups. Coaches switch scam groups on or off;
 * `real` (legitimate calls) is always on.
 */
export const GROUPS = [
  'bank',
  'government',
  'family',
  'tech',
  'delivery',
  'utility',
  'prize',
  'romance',
  'real',
] as const;
export type Group = (typeof GROUPS)[number];
export const GroupSchema = z.enum(GROUPS);
export const SCAM_GROUPS = GROUPS.filter((g): g is Exclude<Group, 'real'> => g !== 'real');

/** Fictional NANP block only: (NXX) 555-0100 … 555-0199. */
export const FICTIONAL_PHONE_RE = /^\(\d{3}\) 555-01\d{2}$/;
export const PhoneSchema = z
  .string()
  .regex(FICTIONAL_PHONE_RE, 'Phone numbers must be (NXX) 555-01xx (fictional block)');

/** The exact second-button label AC-F2-3 requires for card-based callers. */
export const CARD_CALLBACK_LABEL = 'Hang up and call the number on my card';

export const END = 'END';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const LineIdSchema = z.string().regex(ID_RE, 'Line ids are lowercase letters, digits and dashes');
const VoiceIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);

export const ReplySchema = z.strictObject({
  label: z.string().min(1).max(32),
  goto: z.string().min(1),
});

export const LineSchema = z.strictObject({
  id: LineIdSchema,
  say: z.string().min(1).max(400),
  /** Caption speaker label. Defaults to "Caller". */
  speaker: z.string().min(1).max(40).optional(),
  /** Overrides the caller voice for this line (e.g. a second speaker). */
  voice: VoiceIdSchema.optional(),
  tactics: z.array(TacticSchema).min(1).max(4).optional(),
  flag: z.boolean().optional(),
  ask: z.boolean().optional(),
  /** Where in the clip the red flag lands, 0..1 (default 0.5). */
  cueAt: z.number().min(0).max(1).optional(),
  pauseAfterMs: z.number().int().min(0).max(8000).optional(),
  replies: z.array(ReplySchema).min(1).max(2).optional(),
  /** Next line id, or "END". Default: the following line. */
  next: z.string().min(1).optional(),
});
export type Line = z.infer<typeof LineSchema>;

export const SourceRefSchema = z.strictObject({
  key: z.string().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
  page: z.union([z.number().int().positive(), z.string().regex(/^\d+(?:[–-]\d+)?(?: fn \d+)?$/)]).optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const IvrLineSchema = z.strictObject({
  id: LineIdSchema,
  say: z.string().min(1).max(400),
});
export type IvrLine = z.infer<typeof IvrLineSchema>;

export const CallbackSchema = z.strictObject({
  /** Second-button label, e.g. "Hang up and call the number on my card". */
  label: z.string().min(8).max(60),
  /** Completes "You called …": e.g. "the number on your card", "the pharmacy's own number". */
  trustedSource: z.string().min(3).max(60),
  /** The organisation's real (fictional) line. */
  number: PhoneSchema,
  voice: VoiceIdSchema,
  ivr: z.array(IvrLineSchema).min(1).max(4),
});
export type Callback = z.infer<typeof CallbackSchema>;

export const CallerSchema = z.strictObject({
  display: z.string().min(1).max(60),
  number: PhoneSchema,
  voice: VoiceIdSchema,
  bed: z.enum(['callcentre', 'pharmacy', 'home', 'street', 'none']),
});
export type Caller = z.infer<typeof CallerSchema>;
export type AmbienceId = Caller['bed'];

const VarNameSchema = z.string().regex(/^[a-z][a-zA-Z0-9]{0,23}$/);

const TemplateBase = {
  id: z.string().regex(/^(?:[SL]\d{2}|F-[a-z0-9]{6,16})-?[a-z0-9-]*$/),
  kind: KindSchema,
  group: GroupSchema,
  /** FTC / IC3 category slug, e.g. "business-impersonation.bank". */
  category: z.string().regex(/^[a-z]+(?:[.-][a-z0-9]+)*$/),
  /** Noun phrase for result cards: "a fake bank call", "a real pharmacy call". */
  summary: z.string().min(3).max(48),
  /** Legit only: "That was {who}." e.g. "the real pharmacy". */
  who: z.string().min(3).max(48).optional(),
  /** Scam only: what the ask wants, for "Hung up 4 s after they asked for {askFor}." e.g. "the code". */
  askFor: z.string().min(3).max(40).optional(),
  /** Legit only: what a hang-up would have cost, e.g. "you'd have missed your refill". */
  missCost: z.string().min(3).max(80).optional(),
  caller: CallerSchema,
  vars: z.record(VarNameSchema, z.array(z.string().min(1).max(60)).min(1).max(8)).default({}),
  lines: z.array(LineSchema).min(2).max(24),
  callback: CallbackSchema,
  /** One plain sentence for the replay, ≤ 140 chars. */
  advice: z.string().min(10).max(140),
};

export const ScenarioTemplateSchema = z.strictObject({
  ...TemplateBase,
  sources: z.array(SourceRefSchema).min(1),
});
export type ScenarioTemplate = z.infer<typeof ScenarioTemplateSchema>;
export type ScenarioTemplateInput = z.input<typeof ScenarioTemplateSchema>;

/** Family-written calls have no published source. */
export const FamilyTemplateSchema = z.strictObject({
  ...TemplateBase,
  sources: z.array(SourceRefSchema).max(0).default([]),
});

export const AddressTermsSchema = z.array(z.string().min(1).max(24)).min(1).max(32);

export const VoiceDefSchema = z.strictObject({
  label: z.string(),
  sapi: z.string().optional(),
  sapiRate: z.number().int().min(-10).max(10).optional(),
  /** Build-time pitch ratio applied before the phone filter (1 = unchanged). */
  pitch: z.number().min(0.8).max(1.25).optional(),
  piper: z.strictObject({ model: z.string(), speaker: z.number().int().min(0).optional() }).optional(),
  kitten: z.string().optional(),
});
export const VoicesSchema = z.record(VoiceIdSchema, VoiceDefSchema);
export type VoiceDef = z.infer<typeof VoiceDefSchema>;

/** The compiled library shipped as `public/scenarios/library.json`. */
export const LibrarySchema = z.strictObject({
  version: z.string(),
  addressTerms: AddressTermsSchema,
  templates: z.array(ScenarioTemplateSchema),
});
export type Library = z.infer<typeof LibrarySchema>;
