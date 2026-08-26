type Entry<T> = { expires: number; value: T };

type Box<T> = {
  cache: Map<string, Entry<T>>;
  inflight: Map<string, Promise<T>>;
};

const globalForMemo = globalThis as unknown as {
  __ictServerMemos?: Record<string, Box<unknown>>;
  __ictMetaCache?: Map<string, { expires: number; body: unknown }>;
  __ictMetaInflight?: Map<string, Promise<unknown>>;
};

const MAX_ENTRIES = Math.max(50, Number(process.env.SERVER_MEMO_MAX_ENTRIES || 500));

export function canonicalizeMemoKey(key: string) {
  if (!key || key === "all" || key === "default") return key;
  const query = key.startsWith("?") ? key.slice(1) : key;
  if (!query.includes("=") && !query.includes("&")) return key;
  const params = new URLSearchParams(query);
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const next = new URLSearchParams();
  for (const [name, value] of sorted) next.append(name, value);
  const encoded = next.toString();
  return key.startsWith("?") ? `?${encoded}` : encoded;
}

function evictExpired<T>(box: Box<T>, now = Date.now()) {
  for (const [key, entry] of box.cache) {
    if (entry.expires <= now) box.cache.delete(key);
  }
  while (box.cache.size >= MAX_ENTRIES) {
    const oldest = box.cache.keys().next().value;
    if (oldest === undefined) break;
    box.cache.delete(oldest);
  }
}

function touch<T>(box: Box<T>, key: string, entry: Entry<T>) {
  box.cache.delete(key);
  box.cache.set(key, entry);
}

export function memoizeAsync<T>(namespace: string, ttlMs: number) {
  globalForMemo.__ictServerMemos ??= {};
  const existing = globalForMemo.__ictServerMemos[namespace] as Box<T> | undefined;
  const box: Box<T> = existing ?? { cache: new Map(), inflight: new Map() };
  globalForMemo.__ictServerMemos[namespace] = box as Box<unknown>;

  async function memo(key: string, load: () => Promise<T>): Promise<T> {
    const canon = canonicalizeMemoKey(key);
    evictExpired(box);
    const hit = box.cache.get(canon);
    if (hit && hit.expires > Date.now()) {
      touch(box, canon, hit);
      return hit.value;
    }
    const pending = box.inflight.get(canon);
    if (pending) return pending;
    const task = load()
      .then((value) => {
        evictExpired(box);
        touch(box, canon, { expires: Date.now() + ttlMs, value });
        return value;
      })
      .finally(() => box.inflight.delete(canon));
    box.inflight.set(canon, task);
    return task;
  }

  memo.peek = (key: string): T | undefined => {
    const canon = canonicalizeMemoKey(key);
    evictExpired(box);
    const hit = box.cache.get(canon);
    if (hit && hit.expires > Date.now()) {
      touch(box, canon, hit);
      return hit.value;
    }
    return undefined;
  };

  memo.store = (key: string, value: T) => {
    const canon = canonicalizeMemoKey(key);
    evictExpired(box);
    touch(box, canon, { expires: Date.now() + ttlMs, value });
  };

  return memo;
}

export function invalidatePublicCaches(namespaces?: string[]) {
  const memos = globalForMemo.__ictServerMemos;
  if (memos) {
    const targets = namespaces?.length ? namespaces : Object.keys(memos);
    for (const ns of targets) {
      const box = memos[ns];
      if (!box) continue;
      box.cache.clear();
      box.inflight.clear();
    }
  }
  globalForMemo.__ictMetaCache?.clear();
  globalForMemo.__ictMetaInflight?.clear();
}
