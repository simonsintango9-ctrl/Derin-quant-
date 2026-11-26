import { DEFAULT_USER_SETTINGS } from '../constants/markets';
import { MarketSymbol, SignalRecord, TickRecord, UserSettings } from '../types/deriv';

const SETTINGS_STORAGE_KEY = 'deriv_quant_ai_settings_v1';
const DB_NAME = 'deriv_quant_ai_db';
const DB_VERSION = 1;
const STORE_TICKS = 'market_ticks';
const STORE_SIGNALS = 'signal_history';

export function loadUserSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    const validOrder = DEFAULT_USER_SETTINGS.signalCardOrder;
    const rawOrder = Array.isArray(parsed.signalCardOrder) ? parsed.signalCardOrder : [];
    const sanitizedOrder =
      rawOrder.length === validOrder.length &&
      validOrder.every((cat) => rawOrder.includes(cat))
        ? rawOrder
        : validOrder;

    return {
      ...DEFAULT_USER_SETTINGS,
      ...parsed,
      analysisMode:
        parsed.analysisMode === 'duration' || parsed.analysisMode === 'ticks'
          ? parsed.analysisMode
          : DEFAULT_USER_SETTINGS.analysisMode,
      analysisDurationSeconds:
        typeof parsed.analysisDurationSeconds === 'number' &&
        Number.isFinite(parsed.analysisDurationSeconds)
          ? Math.max(10, Math.min(3600, Math.round(parsed.analysisDurationSeconds)))
          : DEFAULT_USER_SETTINGS.analysisDurationSeconds,
      signalCardOrder: sanitizedOrder,
      chartVisibility: {
        ...DEFAULT_USER_SETTINGS.chartVisibility,
        ...(parsed.chartVisibility || {}),
      },
      thresholds: {
        ...DEFAULT_USER_SETTINGS.thresholds,
        ...(parsed.thresholds || {}),
      },
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota / privacy mode errors cleanly
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null);
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_TICKS)) {
          db.createObjectStore(STORE_TICKS, { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains(STORE_SIGNALS)) {
          const signalStore = db.createObjectStore(STORE_SIGNALS, { keyPath: 'id' });
          signalStore.createIndex('generatedAt', 'generatedAt', { unique: false });
          signalStore.createIndex('symbol', 'symbol', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function persistMarketTicks(symbol: MarketSymbol, ticks: TickRecord[]): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_TICKS, 'readwrite');
      const store = tx.objectStore(STORE_TICKS);
      store.put({
        symbol,
        updatedAt: Date.now(),
        ticks: ticks.slice(-2000),
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadMarketTicks(symbol: MarketSymbol): Promise<TickRecord[]> {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_TICKS, 'readonly');
      const store = tx.objectStore(STORE_TICKS);
      const req = store.get(symbol);
      req.onsuccess = () => {
        db.close();
        const result = req.result as { ticks?: TickRecord[] } | undefined;
        resolve(Array.isArray(result?.ticks) ? result.ticks : []);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}

export async function persistSignalRecord(record: SignalRecord): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SIGNALS, 'readwrite');
      const store = tx.objectStore(STORE_SIGNALS);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadAllSignalRecords(): Promise<SignalRecord[]> {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SIGNALS, 'readonly');
      const store = tx.objectStore(STORE_SIGNALS);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const items = (req.result as SignalRecord[]) || [];
        items.sort((a, b) => b.generatedAt - a.generatedAt);
        resolve(items);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}

export async function clearAllStoredData(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_TICKS, STORE_SIGNALS], 'readwrite');
      tx.objectStore(STORE_TICKS).clear();
      tx.objectStore(STORE_SIGNALS).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
