/**
 * 模拟字典服务 API
 *
 * 推荐的专业接口命名规范：
 * 1. 获取所有字典类型列表：
 *    GET /api/v1/dicts
 *    返回: [{ key: 'tenant', name: '租户' }, { key: 'swimlane', name: '泳道' }, ...]
 *
 * 2. 获取指定字典下的所有选项：
 *    GET /api/v1/dicts/:dictKey/items
 *    返回: [{ id: 't-001', name: '美团外卖' }, { id: 't-002', name: '大众点评' }, ...]
 */

const CacheManager = require('../core/CacheManager');

const DICTS = [
  { key: 'tenant', name: '租户' },
  { key: 'swimlane', name: '泳道' },
  { key: 'env', name: '环境' }
];

const DICT_ITEMS = {
  tenant: [
    { id: 't-001', name: '美团外卖 (t-001)' },
    { id: 't-002', name: '大众点评 (t-002)' },
    { id: 't-003', name: '美团优选 (t-003)' }
  ],
  swimlane: [
    { id: 'base', name: '基础泳道 (base)' },
    { id: 'qa-01', name: '测试泳道 01 (qa-01)' },
    { id: 'perf-01', name: '压测泳道 01 (perf-01)' }
  ],
  env: [
    { id: 'test', name: '测试环境 (test)' },
    { id: 'staging', name: '预发环境 (staging)' },
    { id: 'prod', name: '生产环境 (prod)' }
  ]
};

class DictService {
  /**
   * 获取所有字典类型
   */
  async getDictionaries() {
    return CacheManager.get(
      'dicts_list',
      async () => {
        // 模拟网络延迟
        await new Promise(r => setTimeout(r, 200));
        return DICTS;
      },
      24 * 60 * 60 * 1000 // 缓存 24 小时
    );
  }

  /**
   * 获取指定字典下的所有选项
   * @param {string} dictKey 字典的 key，例如 'tenant'
   */
  async getDictionaryItems(dictKey) {
    return CacheManager.get(
      `dict_items_${dictKey}`,
      async () => {
        // 模拟网络延迟
        await new Promise(r => setTimeout(r, 200));
        return DICT_ITEMS[dictKey] || [];
      },
      5 * 60 * 1000 // 缓存 5 分钟
    );
  }
}

module.exports = new DictService();

