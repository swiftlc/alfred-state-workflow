import fs from 'fs';
import path from 'path';

const RECENT_FILE = path.join(__dirname, '../../data/dict_recent.json');

/** 字典条目最近使用时间管理，用于 select_dict 排序 */
class DictRecentManager {
  constructor() {
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(RECENT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(RECENT_FILE)) {
      fs.writeFileSync(RECENT_FILE, JSON.stringify({}), 'utf8');
    }
  }

  private readAll(): Record<string, number> {
    try {
      return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8')) as Record<string, number>;
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, number>): void {
    try {
      fs.writeFileSync(RECENT_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch { /* ignore */ }
  }

  /** 记录某个字典条目被选择 */
  markUsed(dictKey: string, itemId: string): void {
    const data = this.readAll();
    data[`${dictKey}:${itemId}`] = Date.now();
    this.writeAll(data);
  }

  /** 获取某个字典 key 下所有条目的最近使用时间 Map */
  getRecentMap(dictKey: string): Record<string, number> {
    const all = this.readAll();
    const prefix = `${dictKey}:`;
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(prefix)) {
        result[k.slice(prefix.length)] = v;
      }
    }
    return result;
  }
}

export default new DictRecentManager();
