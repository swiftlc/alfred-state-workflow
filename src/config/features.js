const PluginManager = require('../core/PluginManager');

/**
 * 功能矩阵配置
 *
 * 在这里配置所有的工作流功能。
 * - id: 唯一标识
 * - name: 功能名称（展示在 Alfred 中）
 * - description: 功能描述
 * - requiredKeys: 该功能依赖的字典上下文（例如需要租户和泳道才能执行）
 * - action: 对应的执行动作名称（在 src/handlers/actions.js 中注册）
 * - type: 功能类型，默认为普通功能。如果为 'global_dict_action'，则表示这是一个针对所有已选字典项的全局操作。
 */
const builtInFeatures = [
    {
        id: 'tenant_swimlane_login',
        name: '租户泳道登录',
        description: '登录到指定的租户和泳道',
        requiredKeys: ['tenant', 'swimlane'],
        action: 'login'
    },
    {
        id: 'jump_console',
        name: '跳转泳道控制台',
        description: '打开当前泳道的控制台页面',
        requiredKeys: ['swimlane'],
        action: 'open_console'
    },
    {
        id: 'switch_env',
        name: '切换环境',
        description: '切换当前工作环境',
        requiredKeys: ['env'],
        requiredInputs: [
            {
                key: 'ak',
                label: 'appkey',
                placeholder: '请输入或选择appkey',
                // 支持动态获取选项列表
                fetchOptions: async (query, contextData) => {
                    // 模拟从接口获取数据
                    const mockData = [
                        { name: 'com.sankuai.waimai.app', description: '外卖主App' },
                        { name: 'com.sankuai.meituan.app', description: '美团主App' },
                        { name: 'com.sankuai.dianping.app', description: '点评主App' }
                    ];
                    return mockData;
                }
            },
            {key: 'branch', label: '分支名', placeholder: '请输入要切换的分支名'}
        ],
        action: 'switch_env'
    },
    {
        id: 'copy_dict_value',
        name: '复制到剪切板',
        description: '将选中的字典值复制到剪切板',
        requiredKeys: [], // 全局字典操作不需要特定的 requiredKeys，它会根据当前已选的字典动态生成
        action: 'copy_to_clipboard',
        type: 'global_dict_action',
        recordHistory: false // 不记录到历史中
    }
];

// 合并内置功能和插件功能
module.exports = [...builtInFeatures, ...PluginManager.getFeatures()];

