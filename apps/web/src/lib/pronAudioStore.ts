// Recordings the learner made on a pronunciation card, kept LOCALLY so the replay button still
// works after leaving the card (or the tab). They are never uploaded: the score is the data worth
// keeping on the server, the audio is only for the learner's own ear.
//
// IndexedDB rather than localStorage — these are blobs, and localStorage would both refuse the size
// and force a base64 round trip.
const DB_NAME = "msyen-pron-audio";
const STORE = "clips";
const KEEP_DAYS = 7;

type Clip = { key: string; blob: Blob; at: number };

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // private mode / blocked → replay simply won't be available
  });
}

/** One clip per word per learner-visible card. */
export const pronClipKey = (word: string) => `w:${word.trim().toLowerCase()}`;

export async function savePronClip(key: string, blob: Blob): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key, blob, at: Date.now() } satisfies Clip);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function loadPronClip(key: string): Promise<Blob | null> {
  const db = await open();
  if (!db) return null;
  const blob = await new Promise<Blob | null>((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Clip | undefined)?.blob ?? null);
    req.onerror = () => resolve(null);
  });
  db.close();
  return blob;
}

/** Drop clips older than a week — a voice recording from last month helps nobody. */
export async function prunePronClips(): Promise<void> {
  const db = await open();
  if (!db) return;
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      if ((cur.value as Clip).at < cutoff) cur.delete();
      cur.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
