const DATABASE = 'better-rb';
const STORE = 'season-state';
const KEY = 'active-season';
const FALLBACK_KEY = 'better_rb_season_state';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredState() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeStoredState(state) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(structuredClone(state), KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadSeasonState() {
  try {
    const saved = await readStoredState();
    if (saved) return saved;
    const legacy = localStorage.getItem(FALLBACK_KEY);
    if (legacy) {
      const migrated = JSON.parse(legacy);
      await writeStoredState(migrated);
      return migrated;
    }
  } catch (error) {
    console.warn('IndexedDB unavailable; using temporary browser storage.', error);
    const fallback = localStorage.getItem(FALLBACK_KEY);
    if (fallback) return JSON.parse(fallback);
  }
  const response = await fetch('/data/default_state.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load the default season');
  const state = await response.json();
  await saveSeasonState(state);
  return state;
}

export async function saveSeasonState(state) {
  try {
    await writeStoredState(state);
  } catch (error) {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
    console.warn('Saved season in temporary browser storage.', error);
  }
}
