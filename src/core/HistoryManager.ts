import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {HistoryRecord} from '../types';

const HISTORY_FILE = path.join(__dirname, '../../data/history.json');
const MAX_UNPINNED_HISTORY = 10;

class HistoryManager {
  private cache: HistoryRecord[] | null = null;

  constructor() {
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify([]), 'utf8');
    }
  }

  getHistory(): HistoryRecord[] {
    if (this.cache !== null) return this.cache;
    try {
      this.cache = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) as HistoryRecord[];
      return this.cache;
    } catch {
      return [];
    }
  }

  private saveHistory(history: HistoryRecord[]): void {
    this.cache = history;
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  }

  private sortHistory(history: HistoryRecord[]): HistoryRecord[] {
    return history.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.timestamp - a.timestamp;
    });
  }

  addHistory(record: Omit<HistoryRecord, 'id' | 'timestamp' | 'isPinned'>): void {
    let history = this.getHistory();

    // 移除重复记录（基于 action + data 判断）
    history = history.filter(
      (item) =>
        !(
          item.action === record.action &&
          JSON.stringify(item.data) === JSON.stringify(record.data)
        )
    );

    history.unshift({
      id: crypto.randomUUID(),
      ...record,
      timestamp: Date.now(),
      isPinned: false,
    });

    const pinned = history.filter((h) => h.isPinned);
    const unpinned = history.filter((h) => !h.isPinned).slice(0, MAX_UNPINNED_HISTORY);

    this.saveHistory(this.sortHistory([...pinned, ...unpinned]));
  }

  togglePin(id: string): void {
    const history = this.getHistory();
    const item = history.find((h) => h.id === id);
    if (item) {
      item.isPinned = !item.isPinned;
      this.saveHistory(this.sortHistory(history));
    }
  }

  deleteHistory(id: string): void {
    const history = this.getHistory().filter((h) => h.id !== id);
    this.saveHistory(history);
  }

  clearAll(): void {
    // 只清空未固定的历史，保留固定记录
    const history = this.getHistory().filter((h) => h.isPinned);
    this.saveHistory(history);
  }
}

export default new HistoryManager();

