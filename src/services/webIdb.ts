/**
 * IndexedDB persistent blob storage for Workspace files on Web / Browser.
 * Enables local files and folder contents to survive browser page reloads and restarts.
 */

const DB_NAME = 'readspace_web_files_v1';
const STORE_NAME = 'workspace_blobs';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not supported in this environment'));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('workspaceId', 'workspaceId', { unique: false });
            store.createIndex('name', 'name', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          dbPromise = null;
          reject(req.error || new Error('Failed to open IndexedDB'));
        };
        req.onblocked = () => {
          console.warn('[webIdb] open blocked');
        };
      } catch (err) {
        dbPromise = null;
        reject(err);
      }
    });
  }

  return dbPromise;
}

export interface WorkspaceBlobItem {
  key: string;
  workspaceId?: string;
  relativePath: string;
  name: string;
  blob: Blob;
  size: number;
  type: string;
  savedAt: number;
}

/**
 * Save multiple files into IndexedDB in a single transaction
 */
export async function saveAllWorkspaceFiles(
  workspaceId: string,
  items: Array<{ relativePath: string; name: string; file: Blob | File }>
): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || items.length === 0) {
    return;
  }

  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        for (const item of items) {
          const rel = item.relativePath || item.name;
          const key = `${workspaceId}:${rel}`;
          store.put({
            key,
            workspaceId,
            relativePath: rel,
            name: item.name,
            blob: item.file,
            size: item.file.size,
            type: item.file.type,
            savedAt: Date.now(),
          });

          // Also save by clean name for loose fallback lookups
          if (item.name && item.name !== rel) {
            store.put({
              key: `${workspaceId}:${item.name}`,
              workspaceId,
              relativePath: rel,
              name: item.name,
              blob: item.file,
              size: item.file.size,
              type: item.file.type,
              savedAt: Date.now(),
            });
          }
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Transaction error'));
        tx.onabort = () => reject(new Error('Transaction aborted'));
      } catch (err) {
        reject(err);
      }
    });
  } catch (e) {
    console.warn('[webIdb] Failed to batch save workspace files:', e);
  }
}

/**
 * Retrieve a cached file Blob from IndexedDB
 */
export async function getWorkspaceBlob(
  workspaceId: string | undefined,
  pathOrName: string
): Promise<Blob | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || !pathOrName) {
    return null;
  }

  try {
    const db = await getDb();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        // 1. Try exact composite key with workspaceId
        if (workspaceId) {
          const reqExact = store.get(`${workspaceId}:${pathOrName}`);
          reqExact.onsuccess = () => {
            if (reqExact.result && reqExact.result.blob) {
              resolve(reqExact.result.blob);
              return;
            }
            tryLookupByName();
          };
          reqExact.onerror = () => tryLookupByName();
        } else {
          tryLookupByName();
        }

        function tryLookupByName() {
          try {
            const index = store.index('name');
            const fileName = pathOrName.split('/').pop() || pathOrName;
            const reqName = index.get(fileName);
            reqName.onsuccess = () => {
              if (reqName.result && reqName.result.blob) {
                resolve(reqName.result.blob);
              } else {
                resolve(null);
              }
            };
            reqName.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        }
      } catch {
        resolve(null);
      }
    });
  } catch (e) {
    console.warn('[webIdb] getWorkspaceBlob error:', e);
    return null;
  }
}

/**
 * Check if IndexedDB has any blobs stored for a given workspace
 */
export async function hasWorkspaceBlobs(workspaceId: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || !workspaceId) {
    return false;
  }

  try {
    const db = await getDb();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('workspaceId');
        const countReq = index.count(workspaceId);
        countReq.onsuccess = () => resolve(countReq.result > 0);
        countReq.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}
