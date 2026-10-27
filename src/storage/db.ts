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

export function openHucDb(name = DB_NAME): Promise<HucDatabase> {
  return openDB<HucDB>(name, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      runMigrations(db, oldVersion, newVersion, tx);
    },
  });
}

export function deleteHucDb(name = DB_NAME): Promise<void> {
  return deleteDB(name);
}
