/**
 * 字典服务
 *
 * 接口规范：
 * 1. GET /api/v1/dicts           → 返回所有字典类型列表
 * 2. GET /api/v1/dicts/:key/items → 返回指定字典下的所有选项
 */

import CacheManager from '../core/CacheManager';
import {http} from '../core/HttpClient';
import type {DictCategory, DictItem} from '../types';

const DICTS: DictCategory[] = [
  { key: 'tenant', name: '租户' },
  { key: 'swimlane', name: '泳道' },
  { key: 'env', name: '环境' },
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

class DictService {
  /** 获取所有字典类型 */
  async getDictionaries(): Promise<DictCategory[]> {
    return CacheManager.get<DictCategory[]>(
      'dicts_list',
      async () => {
        try {
          const response = await http.get<ApiResponse<DictCategory[]>>(
            'http://127.0.0.1:8083/categories'
          );
          if (response && response.code === 0 && Array.isArray(response.data)) {
            return response.data.map((category) => ({
              key: category.key,
              name: category.name,
            }));
          }
          return DICTS;
        } catch {
          return DICTS;
        }
      },
      24 * 60 * 60 * 1000 // 缓存 24 小时
    ) as Promise<DictCategory[]>;
  }

  /** 获取指定字典下的所有选项 */
  async getDictionaryItems(dictKey: string): Promise<DictItem[]> {
    return CacheManager.get<DictItem[]>(
      `dict_items_${dictKey}`,
      async () => {
        try {
          const response = await http.get<ApiResponse<DictItem[]>>(
            'http://127.0.0.1:8083/dictionaries',
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

