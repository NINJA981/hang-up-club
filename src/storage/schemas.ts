import { z } from 'zod';
import { FamilyCallDraftSchema, ResultCardV1Schema, ScamGroupSchema } from '../domain/links/payloads';
import { KindSchema, TacticSchema } from '../domain/scenario/schema';
import { OUTCOMES } from '../domain/scoring/score';
import { isLocalDate } from '../domain/time/dates';

/**
 * Shapes of everything persisted in IndexedDB (SPEC §9). Every read goes
 * through these schemas (ADR §3.5); a record that fails is quarantined.
 */

const LocalDateSchema = z.string().refine(isLocalDate, 'Not a YYYY-MM-DD date');
const Iso = z.iso.datetime({ offset: true });

export const ProfileSchema = z.strictObject({
  /** Random, device-local, never sent anywhere. Seeds the daily scheduler. */
  id: z.string().min(8).max(64),
  playerName: z.string().trim().min(1).max(30).optional(),
  addressTerm: z.string().trim().min(1).max(30),
  coachName: z.string().trim().min(1).max(30).optional(),
  enabledCategories: z.array(ScamGroupSchema).max(8),
  legitRate: z.number().min(0.3).max(0.5),
  createdAt: Iso,
});
export type Profile = z.infer<typeof ProfileSchema>;

export const SettingsSchema = z.strictObject({
  theme: z.enum(['system', 'light', 'dark']),
  textSize: z.enum(['standard', 'larger']),
  captions: z.boolean(),
  vibrate: z.boolean(),
  sound: z.boolean(),
  /** "HH:MM" for the daily calendar reminder. */
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  audioFormat: z.enum(['opus', 'aac']).optional(),
  /** The player chose "Don't show again" on the install hint. */
  installHintDismissed: z.boolean().optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  textSize: 'standard',
  captions: true,
  vibrate: true,
  sound: true,
};

export const AttemptSchema = z.strictObject({
  localDate: LocalDateSchema,
  /** The daily call is scored; "practice another" is not. */
  scored: z.boolean(),
  scenarioId: z.string().min(1).max(64),
  variantKey: z.string().min(1).max(200),
  kind: KindSchema,
  /** True for a coach-written family call. */
  family: z.boolean().optional(),
  /** Line ids that were played. */
  path: z.array(z.string().max(40)).max(64),
  action: z.enum(['hangup', 'callback', 'none']),
  tActionMs: z.number().int().min(0).optional(),
  tFlagMs: z.number().int().min(0).optional(),
  tAskMs: z.number().int().min(0).optional(),
  tEndMs: z.number().int().min(0),
  outcome: z.enum(OUTCOMES),
  points: z.number().int().min(0).max(100),
  tacticsBeforeAsk: z.array(TacticSchema).max(10),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const TacticBoxSchema = z.strictObject({
  tactic: TacticSchema,
  box: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  lastSeen: LocalDateSchema,
});

export const CheerSchema = z.strictObject({
  id: z.string().min(1).max(64),
  from: z.string().trim().min(1).max(30),
  mime: z.string().max(48),
  audio: z.instanceof(Blob),
  receivedAt: Iso,
  text: z.string().max(80).optional(),
});
export type Cheer = z.infer<typeof CheerSchema>;

export const FamilyCallRecordSchema = z.strictObject({
  /** The family link's own id, so re-opening a link never duplicates it. */
  id: z.string().regex(/^[a-z0-9]{8,16}$/),
  from: z.string().trim().min(1).max(30),
  /** The guided-form draft. The playable template is derived from it. */
  call: FamilyCallDraftSchema,
  receivedAt: Iso,
  played: z.boolean(),
});
export type FamilyCallRecord = z.infer<typeof FamilyCallRecordSchema>;

export const ReceivedResultSchema = z.strictObject({
  id: z.string().min(1).max(64),
  payload: ResultCardV1Schema,
  receivedAt: Iso,
});
export type ReceivedResult = z.infer<typeof ReceivedResultSchema>;

export const CorruptRecordSchema = z.strictObject({
  store: z.string(),
  key: z.string(),
  at: Iso,
  reason: z.string().max(300),
  value: z.unknown(),
});
export type CorruptRecord = z.infer<typeof CorruptRecordSchema>;
