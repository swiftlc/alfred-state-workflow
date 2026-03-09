const dictService = require('../services/dictService');
const features = require('../config/features');
const TaskManager = require('../core/TaskManager');
const { matchQuery } = require('../core/utils');

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 检查某个功能还缺少哪些字典上下文
 */
function getMissingKeys(feature, data) {
  return feature.requiredKeys.filter(key => !data[key]);
}

module.exports = (app) => {
  /**
   * 状态：任务进度展示 (progress)
   * 使用 Alfred 的 rerun 特性动态刷新进度
   */
  app.onState('progress', async (context, wf) => {
    const { jobId } = context;
    const task = TaskManager.getTask(jobId);

    if (!task) {
      return [wf.createRerunItem('❌ 错误', '找不到任务信息', 'home')];
    }

    if (task.status === 'running') {
      const spinner = SPINNERS[task.spinnerIdx % SPINNERS.length];
      TaskManager.updateTask(jobId, { spinnerIdx: (task.spinnerIdx || 0) + 1 });

      return {
        rerun: 0.2, // 告诉 Alfred 0.2 秒后重新执行此 Script Filter
        items: [
          {
            title: `${spinner} ${task.progress}% - ${task.message}`,
            subtitle: '任务执行中，请稍候...',
            valid: false // 禁止用户按回车打断
          }
        ]
      };
    } else if (task.status === 'done') {
      return [
        wf.createRerunItem(`✅ ${task.message || '执行完成'}`, '按回车返回主菜单', 'home')
      ];
    } else {
      return [
        wf.createRerunItem(`❌ 执行失败: ${task.message}`, '按回车返回主菜单', 'home')
      ];
    }
  });

  /**
   * 状态：主页 (home)
   * 展示当前已选的字典上下文，以及可用的功能矩阵
   */
  app.onState('home', async (context, wf) => {
    const data = context.data || {};
    const query = context.query || '';
    const items = [];

    // 1. 字典选择区 (Context)
    const dicts = await dictService.getDictionaries();
    for (const dict of dicts) {
      const selected = data[dict.key];
      const title = selected ? `🏷️ [${dict.name}] ${selected.name}` : `📁 [${dict.name}] 未选择`;
      const subtitle = selected ? '点击重新选择' : '点击选择';

      if (matchQuery(query, dict.name, selected?.name)) {
        items.push(wf.createRerunItem(title, subtitle, 'select_dict', { dictKey: dict.key, data }));
      }
    }

    // 2. 功能矩阵区 (Features)
    for (const feature of features) {
      // 规则：如果该功能不需要任何上下文，或者当前上下文中至少包含一个该功能所需的上下文，则展示
      const hasRelevantContext = feature.requiredKeys.length === 0 || feature.requiredKeys.some(key => data[key]);

      if (!hasRelevantContext) {
        continue; // 上下文完全不匹配时不展示该功能
      }

      if (!matchQuery(query, feature.name, feature.description)) {
        continue;
      }

      const missingKeys = getMissingKeys(feature, data);
      if (missingKeys.length === 0) {
        // 满足条件，可直接执行
        items.push(wf.createItem(`🚀 执行: ${feature.name}`, feature.description, feature.action, { data }));
      } else {
        // 缺少上下文，引导配置
        const missingNames = dicts.filter(d => missingKeys.includes(d.key)).map(d => d.name).join(', ');
        items.push(wf.createRerunItem(`⚙️ 配置: ${feature.name}`, `缺少上下文: ${missingNames} (点击开始配置)`, 'select_dict', {
          dictKey: missingKeys[0],
          data,
          pendingAction: feature.id
        }));
      }
    }

    // 3. 上下文管理
    if (Object.keys(data).length > 0 && matchQuery(query, '清空上下文')) {
      items.push(wf.createRerunItem('🗑️ 清空上下文', '清除所有已选择的字典数据，重新开始', 'home', { data: {} }));
    }

    return items;
  });

  /**
   * 状态：选择字典项 (select_dict)
   * 展示某个字典下的所有选项，供用户选择
   */
  app.onState('select_dict', async (context, wf) => {
    const { dictKey, data = {}, pendingAction } = context;
    const query = context.query || '';
    const items = [];

    let dictItems = await dictService.getDictionaryItems(dictKey);
    const dicts = await dictService.getDictionaries();
    const dictName = dicts.find(d => d.key === dictKey)?.name || dictKey;

    if (query) {
      dictItems = dictItems.filter(item => matchQuery(query, item.name));
      // 增加手动输入结果
      dictItems.unshift({
        id: `manual_${query}`,
        name: query,
        isManual: true
      });
    }

    for (const item of dictItems) {
      const newData = { ...data, [dictKey]: item };

      let title = item.isManual ? `✏️ 手动输入: ${item.name}` : `选择 ${item.name}`;
      let subtitle = item.isManual ? `将 ${item.name} 设置为当前 ${dictName} (手动输入)` : `设置为当前 ${dictName}`;

      if (pendingAction) {
        const feature = features.find(f => f.id === pendingAction);
        const missingKeys = getMissingKeys(feature, newData);

        if (missingKeys.length > 0) {
          // 还有缺失的上下文，继续引导
          const nextDictName = dicts.find(d => d.key === missingKeys[0])?.name || missingKeys[0];
          subtitle = `继续配置 ${feature.name} (下一步: 选择${nextDictName})`;
          items.push(wf.createRerunItem(title, subtitle, 'select_dict', {
            dictKey: missingKeys[0],
            data: newData,
            pendingAction
          }));
        } else {
          // 上下文已齐备，直接提供执行选项
          subtitle = `配置完成，按回车直接执行 [${feature.name}]`;
          items.push(wf.createItem(title, subtitle, feature.action, { data: newData }));
        }
      } else {
        // 普通的选择字典，选完回到主页
        items.push(wf.createRerunItem(title, subtitle, 'home', { data: newData }));
      }
    }

    // 返回上一级
    if (matchQuery(query, '返回')) {
      items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', { data }));
    }

    return items;
  });
};

