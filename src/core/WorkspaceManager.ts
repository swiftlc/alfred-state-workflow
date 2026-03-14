import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {ContextData, WorkspaceRecord} from '../types';

const WORKSPACE_FILE = path.join(__dirname, '../../data/workspaces.json');

class WorkspaceManager {
  constructor() {
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(WORKSPACE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(WORKSPACE_FILE)) {
      fs.writeFileSync(WORKSPACE_FILE, JSON.stringify([]), 'utf8');
    }
  }

  /** 读取所有工作区，按最后使用时间倒序 */
  getAll(): WorkspaceRecord[] {
    try {
      const records = JSON.parse(
        fs.readFileSync(WORKSPACE_FILE, 'utf8')
      ) as WorkspaceRecord[];
      return records.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    } catch {
      return [];
    }
  }

  private save(records: WorkspaceRecord[]): void {
    fs.writeFileSync(WORKSPACE_FILE, JSON.stringify(records, null, 2), 'utf8');
  }

  /**
   * 保存新工作区快照
   * 若同名工作区已存在，则覆盖更新其 data
   */
  add(name: string, data: ContextData): WorkspaceRecord {
    const records = this.getAll();
    const existing = records.find((r) => r.name === name);

    if (existing) {
      existing.data = data;
      existing.lastUsedAt = Date.now();
      existing.usageCount += 1;
      this.save(records);
      return existing;
    }

    const record: WorkspaceRecord = {
      id: crypto.randomUUID(),
      name,
      data,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      usageCount: 0,
    };

    records.unshift(record);
    this.save(records);
    return record;
  }

  /** 加载工作区：更新 lastUsedAt 和 usageCount */
  markUsed(id: string): WorkspaceRecord | null {
    const records = this.getAll();
    const record = records.find((r) => r.id === id);
    if (!record) return null;

    record.lastUsedAt = Date.now();
    record.usageCount += 1;
    this.save(records);
    return record;
  }

  /** 删除工作区 */
  delete(id: string): void {
    const records = this.getAll().filter((r) => r.id !== id);
    this.save(records);
  }

  /** 重命名工作区 */
  rename(id: string, newName: string): void {
    const records = this.getAll();
    const record = records.find((r) => r.id === id);
    if (record) {
      record.name = newName;
      this.save(records);
    }
  }

  /** 根据当前 contextData 生成建议的工作区名称 */
  static suggestName(data: ContextData): string {
    const parts: string[] = [];
    // 过滤掉内部临时 key（下划线开头）
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_')) continue;
      const item = value as { name?: string } | undefined;
      if (item?.name) parts.push(item.name);
    }
    return parts.length > 0 ? parts.join(' / ') : '未命名工作区';
  }
}

const workspaceManager = new WorkspaceManager();
export { WorkspaceManager };
export default workspaceManager;

