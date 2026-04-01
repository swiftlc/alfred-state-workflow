import fs from 'fs';
import path from 'path';

const PIN_FILE = path.join(__dirname, '../../data/dict_pins.json');

/** 字典条目置顶管理，独立持久化，不受缓存清除影响 */
class DictPinManager {
  constructor() {
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(PIN_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(PIN_FILE)) {
      fs.writeFileSync(PIN_FILE, JSON.stringify({}), 'utf8');
    }
  }

  private readAll(): Record<string, boolean> {
    try {
      return JSON.parse(fs.readFileSync(PIN_FILE, 'utf8')) as Record<string, boolean>;
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, boolean>): void {
    try {
      fs.writeFileSync(PIN_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch { /* ignore */ }
  }

  getAll(): Record<string, boolean> {
    return this.readAll();
  }

  isPinned(key: string): boolean {
    return !!this.readAll()[key];
  }

  toggle(key: string): boolean {
    const data = this.readAll();
    if (data[key]) {
      delete data[key];
      this.writeAll(data);
      return false;
    } else {
      data[key] = true;
      this.writeAll(data);
      return true;
    }
  }
}

export default new DictPinManager();
