import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(__dirname, '../../data/cache.json');

interface CacheItem<T = unknown> {
  value: T;
  expireAt: number | null;
}

class CacheManager {
  constructor() {
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CACHE_FILE)) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({}), 'utf8');
    }
  }

  private readAll(): Record<string, CacheItem> {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Record<string, CacheItem>;
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, CacheItem>): void {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Cache write error:', e);
    }
  }

  async get<T = unknown>(
    key: string,
    getter: (() => Promise<T>) | null = null,
    ttlMs = 0
  ): Promise<T | null> {
    const data = this.readAll();
    const item = data[key] as CacheItem<T> | undefined;

    // 缓存命中且未过期
    if (item && (!item.expireAt || Date.now() <= item.expireAt)) {
      return item.value;
    }

    // 缓存过期或不存在，调用 getter 重新获取
    if (getter) {
      try {
        const value = await getter();
        this.set(key, value, ttlMs);
        return value;
      } catch {
        return null;
      }
    }

    // 无 getter，清理过期 key
    if (item) {
      this.clear(key);
    }
    return null;
  }

  set<T = unknown>(key: string, value: T, ttlMs = 0): void {
    const data = this.readAll();
    data[key] = {
      value,
      expireAt: ttlMs ? Date.now() + ttlMs : null,
    };
    this.writeAll(data);
  }

  clear(key: string): void {
    const data = this.readAll();
    delete data[key];
    this.writeAll(data);
  }

  clearAll(): void {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({}), 'utf8');
    } catch { /* ignore */ }
  }
}

export default new CacheManager();

