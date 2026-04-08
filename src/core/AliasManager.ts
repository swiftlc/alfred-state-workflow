import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {AliasRecord, ContextData} from '../types';

const ALIAS_FILE = path.join(__dirname, '../../data/aliases.json');

class AliasManager {
  private cache: AliasRecord[] | null = null;

  constructor() {
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(ALIAS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(ALIAS_FILE)) {
      fs.writeFileSync(ALIAS_FILE, JSON.stringify([]), 'utf8');
    }
  }

  /** 读取所有别名，按使用频次倒序 */
  getAll(): AliasRecord[] {
    if (this.cache !== null) {
      return this.cache.slice().sort((a, b) => b.usageCount - a.usageCount || b.lastUsedAt - a.lastUsedAt);
    }
    try {
      this.cache = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8')) as AliasRecord[];
      return this.cache.slice().sort((a, b) => b.usageCount - a.usageCount || b.lastUsedAt - a.lastUsedAt);
    } catch {
      return [];
    }
  }

  private save(records: AliasRecord[]): void {
    this.cache = records;
    fs.writeFileSync(ALIAS_FILE, JSON.stringify(records, null, 2), 'utf8');
  }

  /**
   * 新增或覆盖别名
   * 同名别名（alias 相同）直接覆盖
   */
  add(
    alias: string,
    action: string,
    data: ContextData,
    title: string,
    subtitle?: string
  ): AliasRecord {
    const records = this.getAll();
    const existing = records.find((r) => r.alias === alias);

    if (existing) {
      existing.action = action;
      existing.data = data;
      existing.title = title;
      existing.subtitle = subtitle;
      existing.lastUsedAt = Date.now();
      this.save(records);
      return existing;
    }

    const record: AliasRecord = {
      id: crypto.randomUUID(),
      alias,
      action,
      data,
      title,
      subtitle,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      usageCount: 0,
    };

    records.unshift(record);
    this.save(records);
    return record;
  }

  /** 标记使用：更新 lastUsedAt 和 usageCount */
  markUsed(id: string): AliasRecord | null {
    const records = this.getAll();
    const record = records.find((r) => r.id === id);
    if (!record) return null;

    record.lastUsedAt = Date.now();
    record.usageCount += 1;
    this.save(records);
    return record;
  }

  /** 删除别名 */
  delete(id: string): void {
    const records = this.getAll().filter((r) => r.id !== id);
    this.save(records);
  }

  /**
   * 按 query 匹配别名
   * 支持：
   *   1. 精确匹配 alias 字段
   *   2. alias 以 query 开头（前缀匹配）
   *   3. alias 包含 query（包含匹配）
   * 返回所有命中的别名，精确匹配排最前
   */
  match(query: string): AliasRecord[] {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const all = this.getAll();

    const exact: AliasRecord[] = [];
    const prefix: AliasRecord[] = [];
    const contains: AliasRecord[] = [];

    for (const record of all) {
      const a = record.alias.toLowerCase();
      if (a === q) {
        exact.push(record);
      } else if (a.startsWith(q)) {
        prefix.push(record);
      } else if (a.includes(q)) {
        contains.push(record);
      }
    }

    return [...exact, ...prefix, ...contains];
  }

  /** 检查 alias 是否已存在 */
  exists(alias: string): boolean {
    return this.getAll().some((r) => r.alias === alias);
  }
}

export { AliasManager };
export default new AliasManager();

