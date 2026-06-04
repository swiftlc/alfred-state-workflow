import crypto from 'crypto';
import { iGet, iPost, iDelete } from './internalHttp';
import type { HistoryRecord } from '../types';

const MAX_UNPINNED_HISTORY = 10;

class HistoryManager {
  async getHistory(): Promise<HistoryRecord[]> {
    return iGet<HistoryRecord[]>('/internal/history');
  }

  async addHistory(record: Omit<HistoryRecord, 'id' | 'timestamp' | 'isPinned'>): Promise<void> {
    const history = await this.getHistory();
    const duplicate = history.find(
      (h) => h.action === record.action && JSON.stringify(h.data) === JSON.stringify(record.data)
    );
    if (duplicate) {
      await iDelete<null>(`/internal/history/${duplicate.id}`);
    }

    const unpinned = history.filter((h) => !h.isPinned && h.id !== duplicate?.id);
    if (unpinned.length >= MAX_UNPINNED_HISTORY) {
      const oldest = unpinned.sort((a, b) => a.timestamp - b.timestamp)[0];
      if (oldest) await iDelete<null>(`/internal/history/${oldest.id}`);
    }

    await iPost<null>('/internal/history', {
      id: crypto.randomUUID(),
      ...record,
      timestamp: Date.now(),
      isPinned: false,
    });
  }

  async togglePin(id: string): Promise<void> {
    await iPost<null>(`/internal/history/${id}/pin`, {});
  }

  async deleteHistory(id: string): Promise<void> {
    await iDelete<null>(`/internal/history/${id}`);
  }

  async clearAll(): Promise<void> {
    await iDelete<null>('/internal/history');
  }
}

export default new HistoryManager();
