/**
 * 字典服务
 *
 * 接口规范：
 * 1. GET /api/v1/dicts           → 返回所有字典类型列表
 * 2. GET /api/v1/dicts/:key/items → 返回指定字典下的所有选项
 *
 * 特殊字典：
 * - appkey: 固定写死 category，条目通过代理接口动态获取，缓存 7 天
 */

import CacheManager from '../core/CacheManager';
import {http} from '../core/HttpClient';
import type {DictCategory, DictItem} from '../types';
import {PROXY_BASE_URL} from '../config/features';

const DICTS: DictCategory[] = [
  { key: 'tenant', name: '租户' },
  { key: 'swimlane', name: '泳道' },
  { key: 'appkey', name: 'appkey' },
];

const DICT_ITEMS: Record<string, DictItem[]> = {
  tenant: [
    { id: 't-001', name: '租户张三 (t-001)' },
    { id: 't-002', name: '租户李四 (t-002)' },
    { id: 't-003', name: '租户王五 (t-003)' },
  ],
  swimlane: [
    { id: 'base', name: '基础泳道 (base)' },
    { id: 'qa-01', name: '测试泳道 01 (qa-01)' },
    { id: 'perf-01', name: '压测泳道 01 (perf-01)' },
  ],
  env: [
    { id: 'test', name: '测试环境 (test)' },
    { id: 'staging', name: '预发环境 (staging)' },
    { id: 'prod', name: '生产环境 (prod)' },
  ],
};

interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

/** octo 接口返回的 appkey 列表响应结构 */
interface OctoAppsResponse {
  success: boolean;
  code: number;
  msg: string | null;
  data: string[];
}

/** appkey 列表查询接口（通过代理服务转发） */
const APPKEY_DEST_URL =
  'https://octo.mws-test.sankuai.com/api/octo/v2/common/apps?mis=liucheng58';

/** appkey 缓存 7 天 */
const APPKEY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

class DictService {
  /** 获取所有字典类型 */
  async getDictionaries(): Promise<DictCategory[]> {
    return DICTS;
  }

  /** 通过代理接口获取 appkey 列表，缓存 7 天 */
  private async fetchAppkeyItems(): Promise<DictItem[]> {
    return CacheManager.get<DictItem[]>(
      'dict_items_appkey',
      async () => {
        const response = await http.proxy<OctoAppsResponse>(
          'GET',
          APPKEY_DEST_URL
        );
        if (response && response.success && Array.isArray(response.data)) {
          return response.data.map((appkey) => ({
            id: appkey,
            name: appkey,
            value: appkey,
          }));
        }
        return [];
      },
      APPKEY_CACHE_TTL
    ) as Promise<DictItem[]>;
  }

  /** 获取指定字典下的所有选项 */
  async getDictionaryItems(dictKey: string): Promise<DictItem[]> {
    // appkey 字典通过代理接口获取，缓存 7 天
    if (dictKey === 'appkey') {
      try {
        return await this.fetchAppkeyItems();
      } catch {
        return [];
      }
    }

    return CacheManager.get<DictItem[]>(
      `dict_items_${dictKey}`,
      async () => {
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
          return DICT_ITEMS[dictKey] ?? [];
        } catch {
          return DICT_ITEMS[dictKey] ?? [];
        }
      },
      5 * 60 * 1000 // 缓存 5 分钟
    ) as Promise<DictItem[]>;
  }
}

export default new DictService();

