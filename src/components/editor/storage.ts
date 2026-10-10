// On-device persistence: projects and original media files live in IndexedDB. Nothing is uploaded.
import type { Project } from './model';

const DB = 'frame-editor'; const VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' }); if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode); const req = fn(tx.objectStore(store)); let value: T | undefined;
    if (req) req.onsuccess = () => { value = req.result; };
    tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export const listProjects = async () => ((await run<Project[]>('projects', 'readonly', s => s.getAll() as IDBRequest<Project[]>)) ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
export const getProject = (id: string) => run<Project>('projects', 'readonly', s => s.get(id) as IDBRequest<Project>);
export const putProject = (p: Project) => run('projects', 'readwrite', s => { s.put(p); });
export const putBlob = (id: string, blob: Blob) => run('blobs', 'readwrite', s => { s.put(blob, id); });
export const getBlob = (id: string) => run<Blob>('blobs', 'readonly', s => s.get(id) as IDBRequest<Blob>);
export async function deleteProject(p: Project) {
  await run('projects', 'readwrite', s => { s.delete(p.id); });
  await run('blobs', 'readwrite', s => { Object.keys(p.media).forEach(id => s.delete(id)); });
}

// Object URLs for media, shared across the app.
const urls = new Map<string, string>();
export const mediaUrl = (id: string) => urls.get(id) ?? '';
export const registerUrl = (id: string, blob: Blob) => { const existing = urls.get(id); if (existing) return existing; const url = URL.createObjectURL(blob); urls.set(id, url); return url; };
export async function loadProjectMedia(p: Project) {
  const missing: string[] = [];
  await Promise.all(Object.keys(p.media).map(async id => { if (urls.has(id)) return; const blob = await getBlob(id).catch(() => undefined); if (blob) registerUrl(id, blob); else missing.push(id); }));
  return missing;
}
