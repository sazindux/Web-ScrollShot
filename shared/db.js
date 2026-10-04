// Minimal IndexedDB helper used by background.js and the editor page.
// Store "captures" (keyPath "id") holds metadata; store "frames" (keyPath "key" = `${captureId}:${index}`,
// index "captureId") holds one record per viewport frame so large captures never go through a single message.
// getCapture() joins them back together (frames sorted by index).
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
const DB_VERSION = 2;
export const STORE_CAPTURES = 'captures';
export const STORE_FRAMES = 'frames';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
        const store = db.createObjectStore(STORE_CAPTURES, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_FRAMES)) {
        const fs = db.createObjectStore(STORE_FRAMES, { keyPath: 'key' });
        fs.createIndex('captureId', 'captureId', { unique: false });
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

/** Store one frame: { captureId, index, blob, scrollX, scrollY, width, height } */
export async function putFrame(frame) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_FRAMES, 'readwrite');
    tx.objectStore(STORE_FRAMES).put({ ...frame, key: `${frame.captureId}:${frame.index}` });
    await txDone(tx);
  } finally {
    db.close();
  }
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Returns the capture record with `frames` populated (inline frames + frames store), or null. */
export async function getCapture(id) {
  const db = await openDb();
  try {
    const tx = db.transaction([STORE_CAPTURES, STORE_FRAMES], 'readonly');
    const record = (await reqToPromise(tx.objectStore(STORE_CAPTURES).get(id))) || null;
    if (record) {
      const stored = await reqToPromise(tx.objectStore(STORE_FRAMES).index('captureId').getAll(id));
      stored.sort((a, b) => a.index - b.index);
      record.frames = [...(record.frames || []), ...stored];
    }
    await txDone(tx);
    return record;
  } finally {
    db.close();
  }
}

async function deleteFramesIn(tx, captureId) {
  const index = tx.objectStore(STORE_FRAMES).index('captureId');
  const keys = await reqToPromise(index.getAllKeys(captureId));
  for (const k of keys) tx.objectStore(STORE_FRAMES).delete(k);
}

export async function deleteCapture(id) {
  const db = await openDb();
  try {
    const tx = db.transaction([STORE_CAPTURES, STORE_FRAMES], 'readwrite');
    tx.objectStore(STORE_CAPTURES).delete(id);
    await deleteFramesIn(tx, id);
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
    const tx = db.transaction([STORE_CAPTURES, STORE_FRAMES], 'readwrite');
    const index = tx.objectStore(STORE_CAPTURES).index('createdAt');
    const range = IDBKeyRange.upperBound(cutoff);
    const oldIds = (await reqToPromise(index.getAll(range))).map((r) => r.id);
    for (const id of oldIds) {
      tx.objectStore(STORE_CAPTURES).delete(id);
      await deleteFramesIn(tx, id);
    }
    await txDone(tx);
    return oldIds.length;
  } finally {
    db.close();
  }
}
