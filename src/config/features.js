/**
 * 功能矩阵配置
 *
 * 在这里配置所有的工作流功能。
 * - id: 唯一标识
 * - name: 功能名称（展示在 Alfred 中）
 * - description: 功能描述
 * - requiredKeys: 该功能依赖的字典上下文（例如需要租户和泳道才能执行）
 * - action: 对应的执行动作名称（在 src/handlers/actions.js 中注册）
 */
module.exports = [
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
    action: 'switch_env'
  }
];

