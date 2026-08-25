type Entry<T> = { expires: number; value: T };

type Box<T> = {
  cache: Map<string, Entry<T>>;
  inflight: Map<string, Promise<T>>;
};

const globalForMemo = globalThis as unknown as { __ictServerMemos?: Record<string, Box<unknown>> };

export function memoizeAsync<T>(namespace: string, ttlMs: number) {
  globalForMemo.__ictServerMemos ??= {};
  const existing = globalForMemo.__ictServerMemos[namespace] as Box<T> | undefined;
  const box: Box<T> = existing ?? { cache: new Map(), inflight: new Map() };
  globalForMemo.__ictServerMemos[namespace] = box as Box<unknown>;

  async function memo(key: string, load: () => Promise<T>): Promise<T> {
    const hit = box.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const pending = box.inflight.get(key);
    if (pending) return pending;
    const task = load()
      .then((value) => {
        box.cache.set(key, { expires: Date.now() + ttlMs, value });
        return value;
      })
      .finally(() => box.inflight.delete(key));
    box.inflight.set(key, task);
    return task;
  }

  memo.peek = (key: string): T | undefined => {
    const hit = box.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    return undefined;
  };

  memo.store = (key: string, value: T) => {
    box.cache.set(key, { expires: Date.now() + ttlMs, value });
  };

  return memo;
}
