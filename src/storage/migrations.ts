import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { HucDB } from './db';

/** The current schema version of the `huc` database. */
export const DB_VERSION = 1;

type UpgradeTx = IDBPTransaction<HucDB, StoreNames<HucDB>[], 'versionchange'>;

/**
 * One explicit function per version (ADR §3.5). `migrations[n]` upgrades a
 * database at version n-1 to version n. Never edit a shipped migration; add a
 * new one and bump DB_VERSION.
 */
export const migrations: Record<number, (db: IDBPDatabase<HucDB>, tx: UpgradeTx) => void> = {
  1: (db) => {
    db.createObjectStore('profile');
    db.createObjectStore('settings');
    const attempts = db.createObjectStore('attempts', { autoIncrement: true });
    attempts.createIndex('byDate', 'localDate');
    db.createObjectStore('tactics', { keyPath: 'tactic' });
    db.createObjectStore('cheers', { keyPath: 'id' });
    db.createObjectStore('familyCalls', { keyPath: 'id' });
    db.createObjectStore('inbox', { keyPath: 'id' });
    db.createObjectStore('corrupt', { autoIncrement: true });
  },
};

export function runMigrations(
  db: IDBPDatabase<HucDB>,
  oldVersion: number,
  newVersion: number | null,
  tx: UpgradeTx,
): void {
  const target = newVersion ?? DB_VERSION;
  for (let v = oldVersion + 1; v <= target; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`No migration to schema version ${String(v)}`);
    step(db, tx);
  }
}
