import { iGet, iPost } from './internalHttp';

class DictPinManager {
  async getAll(): Promise<Record<string, boolean>> {
    return iGet<Record<string, boolean>>('/internal/dict-meta/pins');
  }

  async toggle(itemKey: string): Promise<boolean> {
    const res = await iPost<{ pinned: boolean }>('/internal/dict-meta/pin', { key: itemKey });
    return res.pinned;
  }
}

export default new DictPinManager();
