import crypto from 'crypto';
import { iGet, iPost, iDelete } from './internalHttp';
import type { AliasRecord, ContextData } from '../types';

class AliasManager {
  async getAll(): Promise<AliasRecord[]> {
    return iGet<AliasRecord[]>('/internal/aliases');
  }

  async add(
    alias: string,
    action: string,
    data: ContextData,
    title: string,
    subtitle?: string
  ): Promise<AliasRecord> {
    const all = await this.getAll();
    const existing = all.find((r) => r.alias === alias);
    const record: AliasRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      alias,
      action,
      data,
      title,
      subtitle,
      createdAt: existing?.createdAt ?? Date.now(),
      lastUsedAt: Date.now(),
      usageCount: (existing?.usageCount ?? 0) + 1,
    };
    await iPost<null>('/internal/aliases', record);
    return record;
  }

  async markUsed(id: string): Promise<AliasRecord | null> {
    return iPost<AliasRecord>(`/internal/aliases/${id}/use`, {});
  }

  async rename(id: string, newAlias: string): Promise<AliasRecord | null> {
    const all = await this.getAll();
    const record = all.find((r) => r.id === id);
    if (!record) return null;
    await iDelete<null>(`/internal/aliases/${id}`);
    const updated: AliasRecord = { ...record, alias: newAlias };
    await iPost<null>('/internal/aliases', updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await iDelete<null>(`/internal/aliases/${id}`);
  }
}

export { AliasManager };
export default new AliasManager();
