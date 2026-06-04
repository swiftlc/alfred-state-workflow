import crypto from 'crypto';
import { iGet, iPost, iDelete } from './internalHttp';
import type { ContextData, WorkspaceRecord } from '../types';

class WorkspaceManager {
  async getAll(): Promise<WorkspaceRecord[]> {
    return iGet<WorkspaceRecord[]>('/internal/workspaces');
  }

  async add(name: string, data: ContextData): Promise<WorkspaceRecord> {
    const all = await this.getAll();
    const existing = all.find((r) => r.name === name);
    const record: WorkspaceRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      data,
      createdAt: existing?.createdAt ?? Date.now(),
      lastUsedAt: Date.now(),
      usageCount: (existing?.usageCount ?? 0) + 1,
    };
    await iPost<null>('/internal/workspaces', record);
    return record;
  }

  async delete(id: string): Promise<void> {
    await iDelete<null>(`/internal/workspaces/${id}`);
  }

  async markUsed(id: string): Promise<WorkspaceRecord | null> {
    return iPost<WorkspaceRecord>(`/internal/workspaces/${id}/use`, {});
  }

  static suggestName(data: ContextData): string {
    const parts: string[] = [];
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
