import { iGet, iPost } from './internalHttp';

class DictRecentManager {
  async markUsed(dictKey: string, itemId: string): Promise<void> {
    await iPost('/internal/dict-meta/use', { key: `${dictKey}:${itemId}` });
  }

  async getRecentMap(dictKey: string): Promise<Record<string, number>> {
    return iGet<Record<string, number>>(`/internal/dict-meta/recents/${encodeURIComponent(dictKey)}`);
  }
}

export default new DictRecentManager();
