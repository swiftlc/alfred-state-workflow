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
const { http } = require('../core/HttpClient');

const DICTS = [
  { key: 'tenant', name: '租户' },
  { key: 'swimlane', name: '泳道' },
  { key: 'env', name: '环境' }
];

const DICT_ITEMS = {
  tenant: [
    { id: 't-001', name: '租户张三 (t-001)' },
    { id: 't-002', name: '租户李四 (t-002)' },
    { id: 't-003', name: '租户王五 (t-003)' }
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
        try {
          const response = await http.get('http://127.0.0.1:8083/categories');
          if (response && response.code === 0 && Array.isArray(response.data)) {
            // 将 ["泳道", "租户"] 映射为 [{ key: '泳道', name: '泳道' }, ...]
            // 注意：这里为了兼容旧代码，如果 API 返回的是中文，key 和 name 都使用中文
            // 如果需要映射为英文 key，可以在这里做转换
            return response.data.map(category => ({
              key: category.key,
              name: category.name,
            }));
          }
          return DICTS; // 降级使用本地数据
        } catch (error) {
          console.error('Failed to fetch dictionaries:', error);
          return DICTS; // 降级使用本地数据
        }
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
        try {
          // 注意：如果 dictKey 是中文，axios 会自动进行 urlencode
          const response = await http.get('http://127.0.0.1:8083/dictionaries', {
            params: { categoryKey: dictKey }
          });

          if (response && response.code === 0 && Array.isArray(response.data)) {
            // 将 API 返回的格式映射为工作流需要的格式
            // API: { id, category, title, description, value, ... }
            // Workflow: { id, name, description, value }
            return response.data.map(item => ({
              id: item.id,
              name: item.title || item.value, // 优先使用 title 作为展示名称
              description: item.description || item.value, // 补充描述信息
              value: item.value, // 保留原始 value 供后续使用
              raw: item // 保留原始数据
            }));
          }
          return DICT_ITEMS[dictKey] || []; // 降级使用本地数据
        } catch (error) {
          console.error(`Failed to fetch items for ${dictKey}:`, error);
          return DICT_ITEMS[dictKey] || []; // 降级使用本地数据
        }
      },
      5 * 60 * 1000 // 缓存 5 分钟
    );
  }
}

module.exports = new DictService();

