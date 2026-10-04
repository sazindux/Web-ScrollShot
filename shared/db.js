// Minimal IndexedDB helper used by background.js and the editor page.
// Store: "captures", keyPath: "id"
// Record shape:
// {
//   id: string,
//   createdAt: number (ms),
//   kind: 'single' | 'stitched',
//   dpr: number,
//   viewport: { width, height },         // CSS px
//   document: { width, height },         // CSS px (scrollWidth/Height)
//   selection: { x, y, width, height },  // document CSS px
//   frames: [ { blob: Blob, scrollX, scrollY, width, height } ],  // width/height in CSS px
//   notice?: string                       // optional notice shown in editor (e.g. scaled down)
// }

const DB_NAME = 'scrollshot';
const DB_VERSION = 1;
export const STORE_CAPTURES = 'captures';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
        const store = db.createObjectStore(STORE_CAPTURES, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export async function putCapture(record) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_CAPTURES, 'readwrite');
    tx.objectStore(STORE_CAPTURES).put(record);
    await txDone(tx);
    return record.id;
  } finally {
    db.close();
  }
}

export async function getCapture(id) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_CAPTURES, 'readonly');
    const req = tx.objectStore(STORE_CAPTURES).get(id);
    const result = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

export async function deleteCapture(id) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_CAPTURES, 'readwrite');
    tx.objectStore(STORE_CAPTURES).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}

// Remove every record older than maxAgeMs. Returns number deleted.
export async function pruneCaptures(maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_CAPTURES, 'readwrite');
    const index = tx.objectStore(STORE_CAPTURES).index('createdAt');
    const range = IDBKeyRange.upperBound(cutoff);
    let count = 0;
    await new Promise((resolve, reject) => {
      const req = index.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve();
        cursor.delete();
        count++;
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return count;
  } finally {
    db.close();
  }
}
