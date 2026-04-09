/**
 * 字典服务
 *
 * 接口规范：
 * 1. GET /api/v1/dicts           → 返回所有字典类型列表
 * 2. GET /api/v1/dicts/:key/items → 返回指定字典下的所有选项
 *
 * 扩展点（均在 DICTS 配置）：
 * - cacheTtl：缓存有效期，不填默认 5 分钟
 * - fetchItems：自定义条目获取函数，配置后不走默认 REST 接口
 * - fallbackItems：接口不可用时的兜底数据
 * - copyValue：复制模式，'value' / 'json' / function
 * - readonly：禁止删除条目
 */

import CacheManager from '../core/CacheManager';
import {http} from '../core/HttpClient';
import type {DictCategory, DictItem} from '../types';
import {PROXY_BASE_URL} from '../config/features';

const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// ─── appkey 专用类型（仅此文件使用） ────────────────────────────────────────────

interface OctoAppsResponse {
  success: boolean;
  code: number;
  msg: string | null;
  data: string[];
}

const APPKEY_DEST_URL =
  'https://octo.mws-test.sankuai.com/api/octo/v2/common/apps?mis=liucheng58';

// ─── 字典定义 ────────────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

const DICTS: DictCategory[] = [
  {
    key: 'tenant',
    name: '租户',
    fallbackItems: [
      { id: 't-001', name: '租户张三 (t-001)' },
      { id: 't-002', name: '租户李四 (t-002)' },
      { id: 't-003', name: '租户王五 (t-003)' },
    ],
  },
  {
    key: 'swimlane',
    name: '泳道',
    fallbackItems: [
      { id: 'base', name: '基础泳道 (base)' },
      { id: 'qa-01', name: '测试泳道 01 (qa-01)' },
      { id: 'perf-01', name: '压测泳道 01 (perf-01)' },
    ],
  },
  {
    key: 'appkey',
    name: 'appkey',
    cacheTtl: 7 * 24 * 60 * 60 * 1000,
    copyValue: 'value',
    readonly: true,
    allowDescriptionEdit: false,
    fetchItems: async () => {
      const response = await http.proxy<OctoAppsResponse>('GET', APPKEY_DEST_URL);
      if (response && response.success && Array.isArray(response.data)) {
        return response.data.map((appkey) => ({ id: appkey, name: appkey, value: appkey }));
      }
      return [];
    },
  },
];

// ─── DictService ─────────────────────────────────────────────────────────────────

class DictService {
  /** 字典列表的统一缓存 key，外部需要清缓存时通过此方法获取，避免命名分散 */
  static getCacheKey(dictKey: string): string {
    return `dict_items_${dictKey}`;
  }

  /** 获取所有字典类型 */
  async getDictionaries(): Promise<DictCategory[]> {
    return DICTS;
  }

  /**
   * 仅读取缓存，不发起网络请求。
   * 返回 null 表示缓存未命中（需要发起请求）。
   */
  async getCachedItems(dictKey: string): Promise<DictItem[] | null> {
    return CacheManager.get<DictItem[]>(DictService.getCacheKey(dictKey));
  }

  /** 获取指定字典下的所有选项（优先缓存，缓存未命中则发起请求） */
  async getDictionaryItems(dictKey: string): Promise<DictItem[]> {
    const dictConfig = DICTS.find((d) => d.key === dictKey);
    const ttl = dictConfig?.cacheTtl ?? DEFAULT_CACHE_TTL;

    return (await CacheManager.get<DictItem[]>(
      DictService.getCacheKey(dictKey),
      async () => {
        // 有自定义 fetchItems：直接调用，不走默认 REST 接口
        if (dictConfig?.fetchItems) {
          return dictConfig.fetchItems();
        }
        // 默认：通过代理 REST 接口获取，失败时降级到本地兜底数据
        try {
          const response = await http.get<ApiResponse<DictItem[]>>(
            `${PROXY_BASE_URL}/dictionaries`,
            { params: { categoryKey: dictKey } }
          );
          if (response && response.code === 0 && Array.isArray(response.data)) {
            return response.data.map((item) => ({
              ...item,
              name: (item['title'] as string | undefined) ?? (item.value as string | undefined) ?? '',
            }));
          }
          return dictConfig?.fallbackItems ?? [];
        } catch {
          return dictConfig?.fallbackItems ?? [];
        }
      },
      ttl
    )) ?? [];
  }
}

export { DictService };
export default new DictService();

