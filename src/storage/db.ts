import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DB_VERSION, runMigrations } from './migrations';
import type {
  Attempt,
  Cheer,
  CorruptRecord,
  FamilyCallRecord,
  Profile,
  ReceivedResult,
  Settings,
} from './schemas';
import type { TacticBox } from '../domain/schedule/srs';

export const DB_NAME = 'huc';

/** Object stores of the `huc` database (SPEC §9, ADR §3.5). Values are validated on read, so they are typed as stored. */
export interface HucDB extends DBSchema {
  profile: { key: 'me'; value: Profile };
  settings: { key: 'settings'; value: Settings };
  attempts: { key: number; value: Attempt; indexes: { byDate: string } };
  tactics: { key: string; value: TacticBox };
  cheers: { key: string; value: Cheer };
  familyCalls: { key: string; value: FamilyCallRecord };
  inbox: { key: string; value: ReceivedResult };
  corrupt: { key: number; value: CorruptRecord };
}

export type HucDatabase = IDBPDatabase<HucDB>;

export interface OpenHooks {
  /** Another tab or window still holds an older version open, so the upgrade waits for it. */
  onBlocked?: () => void;
}

export async function openHucDb(name = DB_NAME, hooks: OpenHooks = {}): Promise<HucDatabase> {
  const db = await openDB<HucDB>(name, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      runMigrations(db, oldVersion, newVersion, tx);
    },
    blocked() {
      hooks.onBlocked?.();
    },
    blocking() {
      // A newer version of the app wants to upgrade: let it, instead of hanging both tabs.
      db.close();
    },
  });
  return db;
}

/**
 * Ask the browser not to evict this origin's data (streak, history, offline audio). Best effort:
 * browsers may say no, and it is never asked for before the player has set up.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('storage' in navigator)) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function deleteHucDb(name = DB_NAME): Promise<void> {
  return deleteDB(name);
}
