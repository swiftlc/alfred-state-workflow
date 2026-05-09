/**
 * 字典服务
 *
 * 接口规范：
 * 1. GET /api/v1/dicts           → 返回所有字典类型列表
 * 2. GET /api/v1/dicts/:key/items → 返回指定字典下的所有选项
 *
 * 扩展点（均在 DICTS 配置）：
 * - cacheTtl：缓存有效期，不填默认 5 分钟
 * - fetchItems：自定义条目获取函数，配置后不走默认 REST 接口；抛出异常表示请求失败（不缓存）
 * - fallbackItems：接口不可用时的兜底数据
 * - copyValue：复制模式，'value' / 'json' / function
 * - readonly：禁止删除条目
 */

import CacheManager from '../core/CacheManager';
import {http} from '../core/HttpClient';
import type {DictCategory, DictItem, ContextData} from '../types';
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

const MAFKA_BASE_URL = 'https://mafka.mws-test.sankuai.com';

// ─── mafka 接口类型 ────────────────────────────────────────────────────────────

interface MafkaTopic {
  id: number;
  name: string;
  appkey: string;
  remark: string | null;
  status: number;
}

interface MafkaTopicListResponse {
  code: number;
  msg: string;
  data: {
    total: number;
    list: MafkaTopic[];
  };
}

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
    // 抛出异常 → getDictionaryItems 不缓存，下次进来继续重试
    fetchItems: async () => {
      const response = await http.proxy<OctoAppsResponse>('GET', APPKEY_DEST_URL);
      if (response && response.success && Array.isArray(response.data)) {
        return response.data.map((appkey) => ({ id: appkey, name: appkey, value: appkey }));
      }
      return [];
    },
  },
  {
    key: 'kafka_topic',
    name: 'mafka',
    cacheTtl: 5 * 60 * 1000,
    readonly: true,
    allowDescriptionEdit: false,
    getCacheKey: (contextData?: ContextData) => {
      const appkey = contextData?.['appkey'] as DictItem | undefined;
      const appkeyValue = appkey?.value ?? appkey?.name ?? '';
      return appkeyValue ? `dict_items_kafka_topic:${appkeyValue}` : 'dict_items_kafka_topic:__all__';
    },
    fetchItems: async (contextData?: ContextData) => {
      const appkey = contextData?.['appkey'] as DictItem | undefined;
      const appkeyValue = appkey?.value ?? appkey?.name ?? '';
      // 有 appkey：按 appkey 过滤（type=2）；无 appkey：查询全部（type=3）
      const destUrl = appkeyValue
        ? `${MAFKA_BASE_URL}/mafka/restful/topic/list?pageNum=1&limit=1000&type=2&content=${encodeURIComponent(appkeyValue)}&auth=2`
        : `${MAFKA_BASE_URL}/mafka/restful/topic/list?pageNum=1&limit=1000&type=3&content=&auth=2`;
      const response = await http.proxy<MafkaTopicListResponse>('GET', destUrl, {
        headers: { 'm-appkey': 'fe_mafka-fe' },
      });
      if (response?.code === 0 && Array.isArray(response.data?.list)) {
        return response.data.list
          .filter((t) => t.status === 1)
          .map((t) => ({
            name: t.remark ? t.remark : t.name,
            value: t.name,
            description: t.name,
            _topicId: String(t.id),
          }));
      }
      return [];
    },
    fallbackItems: [],
  },
];

// ─── DictService ─────────────────────────────────────────────────────────────────

class DictService {
  /** 字典列表的统一缓存 key，外部需要清缓存时通过此方法获取，避免命名分散 */
  static getCacheKey(dictKey: string, suffix?: string): string {
    return suffix ? `dict_items_${dictKey}:${suffix}` : `dict_items_${dictKey}`;
  }

  /** 获取所有字典类型 */
  async getDictionaries(): Promise<DictCategory[]> {
    return DICTS;
  }

  /**
   * 仅读取缓存，不发起网络请求。
   * 返回 null 表示缓存未命中（需要发起请求）。
   */
  async getCachedItems(dictKey: string, contextData?: ContextData): Promise<DictItem[] | null> {
    const dictConfig = DICTS.find((d) => d.key === dictKey);
    const cacheKey = dictConfig?.getCacheKey
      ? dictConfig.getCacheKey(contextData)
      : DictService.getCacheKey(dictKey);
    return CacheManager.get<DictItem[]>(cacheKey);
  }

  /**
   * 获取指定字典下的所有选项（优先缓存，缓存未命中则发起请求）。
   * fetchItems 抛出异常时：不写缓存，直接抛出，由调用方决定如何展示错误。
   */
  async getDictionaryItems(dictKey: string, contextData?: ContextData): Promise<DictItem[]> {
    const dictConfig = DICTS.find((d) => d.key === dictKey);
    const ttl = dictConfig?.cacheTtl ?? DEFAULT_CACHE_TTL;
    const cacheKey = dictConfig?.getCacheKey
      ? dictConfig.getCacheKey(contextData)
      : DictService.getCacheKey(dictKey);

    let fetchError: Error | null = null;
    const result = await CacheManager.get<DictItem[]>(
      cacheKey,
      async () => {
        if (dictConfig?.fetchItems) {
          try {
            return await dictConfig.fetchItems(contextData);
          } catch (err) {
            fetchError = err as Error;
            throw err;
          }
        }
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
    );
    if (fetchError) throw fetchError;
    return result ?? [];
  }
}

export { DictService };
export default new DictService();
