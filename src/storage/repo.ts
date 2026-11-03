import type { StoreNames } from 'idb';
import type { z } from 'zod';
import type { TacticBox } from '../domain/schedule/srs';
import type { HucDatabase, HucDB } from './db';
import {
  AttemptSchema,
  CheerSchema,
  DEFAULT_SETTINGS,
  FamilyCallRecordSchema,
  ProfileSchema,
  ReceivedResultSchema,
  SettingsSchema,
  TacticBoxSchema,
  type Attempt,
  type Cheer,
  type CorruptRecord,
  type FamilyCallRecord,
  type Profile,
  type ReceivedResult,
  type Settings,
} from './schemas';

type DataStore = Exclude<StoreNames<HucDB>, 'corrupt'>;

/**
 * Typed access to the `huc` database. Every read is validated with zod
 * (ADR §3.5): a record that fails is moved to the `corrupt` store and skipped,
 * so one damaged row never stops the app. Nothing here logs record contents.
 */
export class Repo {
  constructor(private readonly db: HucDatabase) {}

  private async quarantine(
    store: DataStore,
    key: IDBValidKey,
    value: unknown,
    err: z.ZodError,
  ): Promise<void> {
    const reason = err.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
      .slice(0, 300);
    const record: CorruptRecord = {
      store,
      key: typeof key === 'string' || typeof key === 'number' ? String(key) : JSON.stringify(key),
      at: new Date().toISOString(),
      reason,
      value,
    };
    const tx = this.db.transaction([store, 'corrupt'], 'readwrite');
    await tx.objectStore('corrupt').add(record);
    await tx.objectStore(store).delete(key as never);
    await tx.done;
  }

  /** Read every row of a store through its schema, quarantining invalid rows. */
  private async readAll<T>(
    store: DataStore,
    schema: z.ZodType<T>,
  ): Promise<{ key: IDBValidKey; value: T }[]> {
    const tx = this.db.transaction(store, 'readonly');
    const keys: IDBValidKey[] = await tx.store.getAllKeys();
    const values: unknown[] = await tx.store.getAll();
    await tx.done;
    const good: { key: IDBValidKey; value: T }[] = [];
    const bad: { key: IDBValidKey; value: unknown; error: z.ZodError }[] = [];
    values.forEach((raw, i) => {
      const key = keys[i];
      if (key === undefined) return;
      const parsed = schema.safeParse(raw);
      if (parsed.success) good.push({ key, value: parsed.data });
      else bad.push({ key, value: raw, error: parsed.error });
    });
    for (const b of bad) await this.quarantine(store, b.key, b.value, b.error);
    return good;
  }

  private async readOne<T>(store: DataStore, key: IDBValidKey, schema: z.ZodType<T>): Promise<T | undefined> {
    const raw: unknown = await this.db.get(store, key as never);
    if (raw === undefined) return undefined;
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    await this.quarantine(store, key, raw, parsed.error);
    return undefined;
  }

  // ── profile and settings ──────────────────────────────────────────────

  getProfile(): Promise<Profile | undefined> {
    return this.readOne('profile', 'me', ProfileSchema);
  }

  async putProfile(profile: Profile): Promise<void> {
    await this.db.put('profile', ProfileSchema.parse(profile), 'me');
  }

  async getSettings(): Promise<Settings> {
    return (await this.readOne('settings', 'settings', SettingsSchema)) ?? { ...DEFAULT_SETTINGS };
  }

  async putSettings(settings: Settings): Promise<void> {
    await this.db.put('settings', SettingsSchema.parse(settings), 'settings');
  }

  // ── attempts ───────────────────────────────────────────────────────────

  async addAttempt(attempt: Attempt): Promise<void> {
    await this.db.add('attempts', AttemptSchema.parse(attempt));
  }

  /**
   * One call's result: the attempt and, for a scored call, the new tactic boxes, in one
   * transaction, so a failed write can never keep one without the other.
   */
  async saveCall(attempt: Attempt, boxes?: readonly TacticBox[]): Promise<void> {
    const row = AttemptSchema.parse(attempt);
    const boxRows = boxes?.map((b) => TacticBoxSchema.parse(b));
    const tx = this.db.transaction(['attempts', 'tactics'], 'readwrite');
    const writes: Promise<unknown>[] = [tx.objectStore('attempts').add(row)];
    if (boxRows) {
      const tactics = tx.objectStore('tactics');
      writes.push(tactics.clear(), ...boxRows.map((b) => tactics.put(b)));
    }
    await Promise.all([...writes, tx.done]);
  }

  /** Oldest first. */
  async listAttempts(): Promise<Attempt[]> {
    const rows = await this.readAll('attempts', AttemptSchema);
    return rows.sort((a, b) => Number(a.key) - Number(b.key)).map((r) => r.value);
  }

  async attemptsOn(localDate: string): Promise<Attempt[]> {
    const raw: unknown[] = await this.db.getAllFromIndex('attempts', 'byDate', localDate);
    const out: Attempt[] = [];
    for (const r of raw) {
      const parsed = AttemptSchema.safeParse(r);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  // ── tactic boxes ───────────────────────────────────────────────────────

  async getTacticBoxes(): Promise<TacticBox[]> {
    return (await this.readAll('tactics', TacticBoxSchema)).map((r) => r.value);
  }

  /** Replace the whole set (it holds at most ten rows). */
  async putTacticBoxes(boxes: readonly TacticBox[]): Promise<void> {
    const rows = boxes.map((b) => TacticBoxSchema.parse(b));
    const tx = this.db.transaction('tactics', 'readwrite');
    await tx.store.clear();
    for (const row of rows) await tx.store.put(row);
    await tx.done;
  }

  // ── cheers, family calls, inbox ────────────────────────────────────────

  async putCheer(cheer: Cheer): Promise<void> {
    await this.db.put('cheers', CheerSchema.parse(cheer));
  }

  /** Newest first. */
  async listCheers(): Promise<Cheer[]> {
    const rows = (await this.readAll('cheers', CheerSchema)).map((r) => r.value);
    return rows.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  }

  async deleteCheer(id: string): Promise<void> {
    await this.db.delete('cheers', id);
  }

  async putFamilyCall(call: FamilyCallRecord): Promise<void> {
    await this.db.put('familyCalls', FamilyCallRecordSchema.parse(call));
  }

  async getFamilyCall(id: string): Promise<FamilyCallRecord | undefined> {
    return this.readOne('familyCalls', id, FamilyCallRecordSchema);
  }

  async listFamilyCalls(): Promise<FamilyCallRecord[]> {
    const rows = (await this.readAll('familyCalls', FamilyCallRecordSchema)).map((r) => r.value);
    return rows.sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));
  }

  async markFamilyCallPlayed(id: string): Promise<void> {
    const call = await this.getFamilyCall(id);
    if (call) await this.putFamilyCall({ ...call, played: true });
  }

  async deleteFamilyCall(id: string): Promise<void> {
    await this.db.delete('familyCalls', id);
  }

  async putInbox(item: ReceivedResult): Promise<void> {
    await this.db.put('inbox', ReceivedResultSchema.parse(item));
  }

  /** Newest first. */
  async listInbox(): Promise<ReceivedResult[]> {
    const rows = (await this.readAll('inbox', ReceivedResultSchema)).map((r) => r.value);
    return rows.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  }

  async deleteInbox(id: string): Promise<void> {
    await this.db.delete('inbox', id);
  }

  async clearInbox(): Promise<void> {
    await this.db.clear('inbox');
  }

  // ── housekeeping ───────────────────────────────────────────────────────

  async corruptCount(): Promise<number> {
    return this.db.count('corrupt');
  }

  /** Settings → "Delete everything on this device" (SPEC §10.1). */
  async deleteEverything(): Promise<void> {
    const names: StoreNames<HucDB>[] = [
      'profile',
      'settings',
      'attempts',
      'tactics',
      'cheers',
      'familyCalls',
      'inbox',
      'corrupt',
    ];
    const tx = this.db.transaction(names, 'readwrite');
    await Promise.all(names.map((n) => tx.objectStore(n).clear()));
    await tx.done;
  }
}
