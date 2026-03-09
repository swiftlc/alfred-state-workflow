const dictService = require('../services/dictService');
const features = require('../config/features');
const TaskManager = require('../core/TaskManager');
const HistoryManager = require('../core/HistoryManager');
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
            subtitle: '任务执行中，请稍候... (按 Cmd+Enter 取消任务)',
            valid: false, // 禁止用户按回车打断
            mods: {
              cmd: {
                subtitle: '🛑 取消任务',
                arg: wf.createItem('', '', 'cancel_task', { jobId }).arg,
                valid: true
              }
            }
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

    // 0. 历史记录区 (History)
    const history = HistoryManager.getHistory();
    // 主页展示所有固定的历史，以及最多3条未固定的历史
    const pinnedHistory = history.filter(h => h.isPinned);
    const unpinnedHistory = history.filter(h => !h.isPinned).slice(0, 3);
    const displayHistory = [...pinnedHistory, ...unpinnedHistory];

    if (displayHistory.length > 0) {
      for (const record of displayHistory) {
        const icon = record.isPinned ? '📌' : '🕒';
        const title = `${icon} 历史: ${record.title}`;
        const subtitle = record.subtitle || '点击重新执行';

        if (matchQuery(query, title, subtitle)) {
          items.push(wf.createItem(title, subtitle, record.action, {
            data: record.data,
            copyValue: record.copyValue,
            copyName: record.copyName,
            historyTitle: record.title,
            historySubtitle: record.subtitle
          }, {
            cmd: { subtitle: record.isPinned ? '取消固定' : '固定此记录', action: 'toggle_pin', payload: { id: record.id } }
          }));
        }
      }

      if (matchQuery(query, '管理历史记录')) {
        items.push(wf.createRerunItem('📚 管理历史记录', `查看全部 ${history.length} 条历史记录`, 'history_manage'));
      }
    }

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
      if (feature.type === 'global_dict_action') {
        // 处理全局字典操作类型的 feature
        for (const dict of dicts) {
          const selected = data[dict.key];
          if (selected) {
            const title = `📋 复制 ${dict.name}: ${selected.name}`;
            const subtitle = `将 ${dict.name} [${selected.name}] 复制到剪切板`;

            if (matchQuery(query, title, subtitle)) {
              items.push(wf.createItem(title, subtitle, feature.action, {
                data,
                copyValue: selected.name,
                copyName: dict.name,
                historyTitle: title,
                historySubtitle: subtitle
              }));
            }
          }
        }
        continue;
      }

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
        if (feature.requiredInputs && feature.requiredInputs.length > 0) {
          // 字典上下文已齐备，但还需要手动输入参数
          const nextInput = feature.requiredInputs[0];
          items.push(wf.createRerunItem(`⚙️ 配置: ${feature.name}`, `需要输入: ${nextInput.label} (点击开始配置)`, 'input_state', {
            data,
            pendingAction: feature.id,
            inputIndex: 0
          }));
        } else {
          // 满足条件，可直接执行
          items.push(wf.createItem(`🚀 执行: ${feature.name}`, feature.description, feature.action, {
            data,
            historyTitle: `执行: ${feature.name}`,
            historySubtitle: feature.description
          }));
        }
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

    // 3. 上下文管理与缓存管理
    if (Object.keys(data).length > 0 && matchQuery(query, '清空上下文')) {
      items.push(wf.createRerunItem('🗑️ 清空上下文', '清除所有已选择的字典数据，重新开始', 'home', { data: {} }));
    }

    if (matchQuery(query, '刷新缓存')) {
      items.push(wf.createItem('🔄 强制刷新缓存', '清除本地字典缓存并重新获取', 'refresh_cache'));
    }

    return items;
  });

  /**
   * 状态：历史记录管理 (history_manage)
   */
  app.onState('history_manage', async (context, wf) => {
    const query = context.query || '';
    const items = [];
    const history = HistoryManager.getHistory();

    for (const record of history) {
      const icon = record.isPinned ? '📌' : '🕒';
      const title = `${icon} ${record.title}`;
      const subtitle = `[回车]执行 [Cmd]${record.isPinned ? '取消固定' : '固定'} [Alt]删除`;

      if (matchQuery(query, title, record.subtitle)) {
        items.push(wf.createItem(title, subtitle, record.action, {
          data: record.data,
          copyValue: record.copyValue,
          copyName: record.copyName,
          historyTitle: record.title,
          historySubtitle: record.subtitle
        }, {
          cmd: { subtitle: record.isPinned ? '取消固定' : '固定此记录', action: 'toggle_pin', payload: { id: record.id, returnState: 'history_manage' } },
          alt: { subtitle: '删除此记录', action: 'delete_history', payload: { id: record.id, returnState: 'history_manage' } }
        }));
      }
    }

    if (history.length > 0 && matchQuery(query, '清空历史')) {
      items.push(wf.createItem('🗑️ 清空所有历史记录', '删除所有未固定的历史记录', 'clear_history'));
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home'));
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
        } else if (feature.requiredInputs && feature.requiredInputs.length > 0) {
          // 字典上下文已齐备，但还需要手动输入参数
          const nextInput = feature.requiredInputs[0];
          subtitle = `继续配置 ${feature.name} (下一步: 输入${nextInput.label})`;
          items.push(wf.createRerunItem(title, subtitle, 'input_state', {
            data: newData,
            pendingAction,
            inputIndex: 0
          }));
        } else {
          // 上下文已齐备，直接提供执行选项
          subtitle = `配置完成，按回车直接执行 [${feature.name}]`;
          items.push(wf.createItem(title, subtitle, feature.action, {
            data: newData,
            historyTitle: `执行: ${feature.name}`,
            historySubtitle: feature.description
          }));
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

  /**
   * 状态：手动输入参数 (input_state)
   */
  app.onState('input_state', async (context, wf) => {
    const { data = {}, pendingAction, inputIndex = 0 } = context;
    const query = context.query || '';
    const items = [];

    const feature = features.find(f => f.id === pendingAction);
    if (!feature || !feature.requiredInputs || !feature.requiredInputs[inputIndex]) {
      return [wf.createRerunItem('❌ 错误', '找不到需要输入的配置项', 'home')];
    }

    const currentInput = feature.requiredInputs[inputIndex];
    const isLastInput = inputIndex === feature.requiredInputs.length - 1;

    if (query) {
      const newData = { ...data, [currentInput.key]: query };

      if (isLastInput) {
        items.push(wf.createItem(`✅ 确认输入: ${query}`, `配置完成，按回车直接执行 [${feature.name}]`, feature.action, {
          data: newData,
          historyTitle: `执行: ${feature.name}`,
          historySubtitle: feature.description
        }));
      } else {
        const nextInput = feature.requiredInputs[inputIndex + 1];
        items.push(wf.createRerunItem(`✅ 确认输入: ${query}`, `继续配置 ${feature.name} (下一步: 输入${nextInput.label})`, 'input_state', {
          data: newData,
          pendingAction,
          inputIndex: inputIndex + 1
        }));
      }
    } else {
      items.push({
        title: `✏️ 请输入 ${currentInput.label}`,
        subtitle: currentInput.placeholder || `在搜索框中输入内容后按回车`,
        valid: false
      });
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', { data }));
    return items;
  });
};

