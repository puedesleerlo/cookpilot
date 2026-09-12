import { openDB, type IDBPDatabase } from 'idb';
import type { RecipePack } from '@/domain';
import { validatePack } from './registry';

/**
 * Local persistence for imported packs.
 *
 * Everything here degrades rather than fails. A private window, a browser with storage
 * blocked, or a quota error leaves the user with the seed packs and an honest message —
 * never a blank screen. `available` says which world we are in so the UI can say so too.
 */

const DB_NAME = 'kitchen-compiler';
const DB_VERSION = 1;
const PACKS = 'packs';
const SESSIONS = 'sessions';

let dbPromise: Promise<IDBPDatabase | null> | null = null;

const open = (): Promise<IDBPDatabase | null> => {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      if (typeof indexedDB === 'undefined') return null;
      return await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(PACKS)) db.createObjectStore(PACKS, { keyPath: 'packId' });
          if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: 'id' });
        },
      });
    } catch {
      return null;
    }
  })();
  return dbPromise;
};

export type StorageStatus = { available: boolean; reason?: string };

export const storageStatus = async (): Promise<StorageStatus> => {
  const db = await open();
  return db
    ? { available: true }
    : { available: false, reason: 'Local storage is unavailable, so imported packs will not be kept.' };
};

export const savePack = async (pack: RecipePack): Promise<boolean> => {
  const db = await open();
  if (!db) return false;
  try {
    await db.put(PACKS, pack);
    return true;
  } catch {
    return false;
  }
};

export const deletePack = async (packId: string): Promise<boolean> => {
  const db = await open();
  if (!db) return false;
  try {
    await db.delete(PACKS, packId);
    return true;
  } catch {
    return false;
  }
};

/** Anything that no longer validates is skipped, not thrown — schemas move on. */
export const loadStoredPacks = async (): Promise<RecipePack[]> => {
  const db = await open();
  if (!db) return [];
  try {
    const rows = (await db.getAll(PACKS)) as unknown[];
    return rows.flatMap((row) => {
      const { pack } = validatePack(row);
      return pack ? [pack] : [];
    });
  } catch {
    return [];
  }
};

// --------------------------------------------------------------- sessions

export const saveSession = async <T extends { id: string }>(session: T): Promise<boolean> => {
  const db = await open();
  if (!db) return false;
  try {
    await db.put(SESSIONS, session);
    return true;
  } catch {
    return false;
  }
};

export const loadSession = async <T>(id: string): Promise<T | null> => {
  const db = await open();
  if (!db) return null;
  try {
    return ((await db.get(SESSIONS, id)) as T | undefined) ?? null;
  } catch {
    return null;
  }
};

/** Test seam: drop the cached connection so a fresh `open()` runs. */
export const resetStorageForTest = (): void => {
  dbPromise = null;
};
