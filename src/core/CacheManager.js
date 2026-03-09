const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../../data/cache.json');

class CacheManager {
  constructor() {
    this.ensureFileExists();
  }

  ensureFileExists() {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CACHE_FILE)) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({}), 'utf8');
    }
  }

  async get(key, getter = null, ttlMs = 0) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const item = data[key];

      // 如果缓存存在且未过期，直接返回
      if (item && (!item.expireAt || Date.now() <= item.expireAt)) {
        return item.value;
      }

      // 如果缓存过期或不存在，且提供了 getter，则重新获取并缓存
      if (getter) {
        const value = await getter();
        this.set(key, value, ttlMs);
        return value;
      }

      // 如果没有 getter 且缓存无效，清理并返回 null
      if (item) {
        this.clear(key);
      }
      return null;
    } catch (e) {
      if (getter) {
        try {
          const value = await getter();
          this.set(key, value, ttlMs);
          return value;
        } catch (err) {
          return null;
        }
      }
      return null;
    }
  }

  set(key, value, ttlMs = 0) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      data[key] = {
        value,
        expireAt: ttlMs ? Date.now() + ttlMs : null
      };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Cache write error:', e);
    }
  }

  clear(key) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      delete data[key];
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
  }

  clearAll() {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({}), 'utf8');
    } catch (e) {}
  }
}

module.exports = new CacheManager();

