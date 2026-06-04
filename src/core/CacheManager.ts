import { iGet, iPost, iDelete } from './internalHttp';

class CacheManager {
  async get<T = unknown>(
    key: string,
    getter: (() => Promise<T>) | null = null,
    ttlMs = 0
  ): Promise<T | null> {
    const value = await iGet<T | null>(`/internal/cache/${encodeURIComponent(key)}`);

    if (value !== null) return value;

    if (getter) {
      try {
        const fetched = await getter();
        await this.set(key, fetched, ttlMs);
        return fetched;
      } catch {
        return null;
      }
    }
    return null;
  }

  async set<T = unknown>(key: string, value: T, ttlMs = 0): Promise<void> {
    await iPost(`/internal/cache/${encodeURIComponent(key)}`, { value, ttlMs });
  }

  async clear(key: string): Promise<void> {
    await iDelete(`/internal/cache/${encodeURIComponent(key)}`);
  }

  async clearAll(): Promise<void> {
    await iDelete('/internal/cache/');
  }
}

export default new CacheManager();
