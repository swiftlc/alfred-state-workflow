import dictService from '../services/dictService';
import features from '../config/features';
import TaskManager from '../core/TaskManager';
import HistoryManager from '../core/HistoryManager';
import {matchQuery} from '../core/utils';
import Icons, {icon} from '../core/icons';
import type Workflow from '../core/Workflow';
import type {AlfredItem, ContextData, DictItem, Feature} from '../types';

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** 检查某个功能还缺少哪些字典上下文 */
function getMissingKeys(feature: Feature, data: ContextData): string[] {
  return feature.requiredKeys.filter((key) => !data[key]);
}

/** 将历史记录的 data 格式化为可读字符串 */
function formatContextInfo(data: ContextData): string {
  if (!data || Object.keys(data).length === 0) return '';
  const parts: string[] = [];
  for (const value of Object.values(data)) {
    const item = value as DictItem | undefined;
    if (item?.name) {
      parts.push(item.name);
    } else if (typeof value === 'string') {
      parts.push(value);
    }
  }
  return parts.length > 0 ? `[${parts.join(', ')}]` : '';
}

export default function registerStates(app: Workflow): void {
  /**
   * 状态：任务进度展示 (progress)
   * 使用 Alfred 的 rerun 特性动态刷新进度
   */
  app.onState('progress', async (context, wf) => {
    const jobId = context.jobId ?? '';
    const task = TaskManager.getTask(jobId);

    if (!task) {
      return [wf.createRerunItem('❌ 错误', '找不到任务信息', 'home', { data: context.data }, {}, Icons.task)];
    }

    if (task.status === 'running') {
      const spinner = SPINNERS[task.spinnerIdx % SPINNERS.length];
      TaskManager.updateTask(jobId, { spinnerIdx: (task.spinnerIdx ?? 0) + 1 });

      return {
        rerun: 0.2,
        items: [
          {
            title: `${spinner} ${task.progress}% - ${task.message}`,
            subtitle: '任务执行中，请稍候... (按回车后台执行，按 Cmd+Enter 取消任务)',
            arg: wf.createItem('', '', 'rerun', { nextState: 'home', data: context.data }).arg,
            icon: icon('task'),
            valid: true,
            mods: {
              cmd: {
                subtitle: '🛑 取消任务',
                arg: wf.createItem('', '', 'cancel_task', { jobId, data: context.data }).arg,
                valid: true,
              },
            },
          } as AlfredItem,
        ],
      };
    }

    if (task.status === 'done') {
      return [
        wf.createRerunItem(
          `✅ ${task.message || '执行完成'}`,
          '按回车返回主菜单',
          'home',
          { data: context.data },
          {},
          Icons.task
        ),
      ];
    }

    return [
      wf.createRerunItem(
        `❌ 执行失败: ${task.message}`,
        '按回车返回主菜单',
        'home',
        { data: context.data },
        {},
        Icons.task
      ),
    ];
  });

  /**
   * 状态：主页 (home)
   */
  app.onState('home', async (context, wf) => {
    const data = context.data ?? {};
    const query = context.query ?? '';
    const items: AlfredItem[] = [];

    // 1. 历史记录区
    const history = HistoryManager.getHistory();
    const pinnedHistory = history.filter((h) => h.isPinned);
    const unpinnedHistory = history.filter((h) => !h.isPinned).slice(0, 3);
    const displayHistory = [...pinnedHistory, ...unpinnedHistory];

    for (const record of displayHistory) {
      const histIcon = record.isPinned ? '📌' : '🕒';
      const title = `${histIcon} 历史: ${record.title}`;
      const subtitle = formatContextInfo(record.data) || '点击重新执行';

      if (matchQuery(query, title, subtitle)) {
        items.push(
          wf.createItem(
            title,
            subtitle,
            record.action,
            {
              data: record.data,
              copyValue: record.copyValue,
              copyName: record.copyName,
              historyTitle: record.title,
              historySubtitle: record.subtitle,
            },
            {
              cmd: {
                subtitle: record.isPinned ? '取消固定' : '固定此记录',
                action: 'toggle_pin',
                payload: { id: record.id },
              },
            },
            Icons.history
          )
        );
      }
    }

    if (displayHistory.length > 0 && matchQuery(query, '管理历史记录')) {
      items.push(
        wf.createRerunItem('📚 管理历史记录', `查看全部 ${history.length} 条历史记录`, 'history_manage', {}, {}, Icons.history)
      );
    }

    // 2. 字典选择区
    const dicts = await dictService.getDictionaries();
    for (const dict of dicts) {
      const selected = data[dict.key] as DictItem | undefined;
      const title = selected ? `🏷️ [${dict.name}] ${selected.name}` : `📁 [${dict.name}] 未选择`;
      const subtitle = selected ? '点击重新选择' : '点击选择';

      if (matchQuery(query, dict.name, selected?.name)) {
        items.push(wf.createRerunItem(title, subtitle, 'select_dict', { dictKey: dict.key, data }, {}, Icons.context));
      }
    }

    // 3. 功能矩阵区
    for (const feature of features) {
      if (feature.type === 'split_by_dict') {
        for (const dict of dicts) {
          const selected = data[dict.key] as DictItem | undefined;
          if (!selected) continue;

          const contextData: ContextData = {
            ...data,
            _currentDict: dict as unknown as DictItem,
            _currentSelected: selected,
          };
          const featureName = typeof feature.name === 'function' ? feature.name(contextData) : feature.name;
          const featureDescription =
            typeof feature.description === 'function' ? feature.description(contextData) : feature.description;

          if (!matchQuery(query, featureName, featureDescription)) continue;

          const featureIconPath = feature.icon?.path;
          if (feature.requiredInputs && feature.requiredInputs.length > 0) {
            items.push(
              wf.createRerunItem(featureName, featureDescription, 'input_state', {
                data: contextData,
                dictKey: dict.key,
                pendingAction: feature.id,
                inputIndex: 0,
              }, {}, featureIconPath)
            );
          } else {
            items.push(
              wf.createItem(featureName, featureDescription, feature.action, {
                data: contextData,
                dictKey: dict.key,
                historyTitle: featureName,
                historySubtitle: featureDescription,
                recordHistory: feature.recordHistory !== false,
              }, {}, featureIconPath)
            );
          }
        }
        continue;
      }

      const hasRelevantContext =
        feature.requiredKeys.length === 0 || feature.requiredKeys.some((key) => data[key]);
      if (!hasRelevantContext) continue;
      if (typeof feature.condition === 'function' && !feature.condition(data)) continue;

      const featureName = typeof feature.name === 'function' ? feature.name(data) : feature.name;
      const featureDescription =
        typeof feature.description === 'function' ? feature.description(data) : feature.description;

      if (!matchQuery(query, featureName, featureDescription)) continue;

      const featureIconPath = feature.icon?.path;
      const missingKeys = getMissingKeys(feature, data);
      if (missingKeys.length === 0) {
        if (feature.requiredInputs && feature.requiredInputs.length > 0) {
          const nextInput = feature.requiredInputs[0]!;
          items.push(
            wf.createRerunItem(
              `⚙️ 配置: ${featureName}`,
              `需要输入: ${nextInput.label} (点击开始配置)`,
              'input_state',
              { data, pendingAction: feature.id, inputIndex: 0 },
              {},
              featureIconPath
            )
          );
        } else {
          items.push(
            wf.createItem(` ${featureName}`, featureDescription, feature.action, {
              data,
              historyTitle: `执行: ${featureName}`,
              historySubtitle: featureDescription,
              recordHistory: feature.recordHistory !== false,
            }, {}, featureIconPath)
          );
        }
      } else {
        const missingNames = dicts
          .filter((d) => missingKeys.includes(d.key))
          .map((d) => d.name)
          .join(', ');
        items.push(
          wf.createRerunItem(
            `⚙️ 配置: ${featureName}`,
            `缺少上下文: ${missingNames} (点击开始配置)`,
            'select_dict',
            { dictKey: missingKeys[0], data, pendingAction: feature.id },
            {},
            featureIconPath
          )
        );
      }
    }

    // 4. 任务中心入口
    const tasks = TaskManager.getAllTasks();
    if (tasks.length > 0) {
      const runningCount = tasks.filter((t) => t.status === 'running').length;
      const title =
        runningCount > 0
          ? `⏳ 任务中心 (${runningCount}个运行中)`
          : `📋 任务中心 (${tasks.length}个历史任务)`;
      if (matchQuery(query, '任务中心', 'task')) {
        items.push(wf.createRerunItem(title, '查看和管理后台任务', 'task_manage', { data }, {}, Icons.task));
      }
    }

    // 5. 上下文 / 缓存管理
    if (Object.keys(data).length > 0 && matchQuery(query, '清空上下文')) {
      items.push(
        wf.createRerunItem('🗑️ 清空上下文', '清除所有已选择的字典数据，重新开始', 'home', { data: {} }, {}, Icons.context)
      );
    }

    if (matchQuery(query, '刷新缓存')) {
      items.push(wf.createItem('🔄 强制刷新缓存', '清除本地字典缓存并重新获取', 'refresh_cache', {}, {}, Icons.cache));
    }

    return items;
  });

  /**
   * 状态：历史记录管理 (history_manage)
   */
  app.onState('history_manage', async (context, wf) => {
    const query = context.query ?? '';
    const items: AlfredItem[] = [];
    const history = HistoryManager.getHistory();

    for (const record of history) {
      const histIcon = record.isPinned ? '📌' : '🕒';
      const title = `${histIcon} ${record.title}`;
      const contextInfo = formatContextInfo(record.data);
      const subtitle =
        (contextInfo ? contextInfo + ' ' : '') +
        `[回车]执行 [Cmd]${record.isPinned ? '取消固定' : '固定'} [Alt]删除`;

      if (matchQuery(query, title, record.subtitle)) {
        items.push(
          wf.createItem(
            title,
            subtitle,
            record.action,
            {
              data: record.data,
              copyValue: record.copyValue,
              copyName: record.copyName,
              historyTitle: record.title,
              historySubtitle: record.subtitle,
            },
            {
              cmd: {
                subtitle: record.isPinned ? '取消固定' : '固定此记录',
                action: 'toggle_pin',
                payload: { id: record.id, returnState: 'history_manage' },
              },
              alt: {
                subtitle: '删除此记录',
                action: 'delete_history',
                payload: { id: record.id, returnState: 'history_manage' },
              },
            },
            Icons.history
          )
        );
      }
    }

    if (history.length > 0 && matchQuery(query, '清空历史')) {
      items.push(wf.createItem('🗑️ 清空所有历史记录', '删除所有未固定的历史记录', 'clear_history', {}, {}, Icons.history));
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', { data: context.data }, {}, Icons.workflow));
    return items;
  });

  /**
   * 状态：任务管理 (task_manage)
   */
  app.onState('task_manage', async (context, wf) => {
    const query = context.query ?? '';
    const items: AlfredItem[] = [];
    const tasks = TaskManager.getAllTasks();

    if (tasks.length === 0) {
      return [wf.createRerunItem('暂无后台任务', '按回车返回主菜单', 'home', { data: context.data })];
    }

    let hasRunning = false;
    let hasDoneOrError = false;

    for (const task of tasks) {
      let taskEmoji = '⏳';
      let subtitle = '';
      let action = 'rerun';
      let payload: Record<string, unknown> = { nextState: 'progress', jobId: task.id, data: context.data };
      let mods: Record<string, { subtitle: string; action: string; payload: Record<string, unknown> }> = {};

      if (task.status === 'running') {
        hasRunning = true;
        taskEmoji = SPINNERS[(task.spinnerIdx ?? 0) % SPINNERS.length]!;
        subtitle = `[运行中] ${task.progress}% - ${task.message} (回车查看进度，Cmd取消)`;
        mods = {
          cmd: {
            subtitle: '🛑 取消任务',
            action: 'cancel_task',
            payload: { jobId: task.id, returnState: 'task_manage' },
          },
        };
      } else if (task.status === 'done') {
        hasDoneOrError = true;
        taskEmoji = '✅';
        subtitle = `[已完成] ${task.message} (回车清除记录)`;
        action = 'clear_task';
        payload = { jobId: task.id, returnState: 'task_manage' };
      } else if (task.status === 'error') {
        hasDoneOrError = true;
        taskEmoji = '❌';
        subtitle = `[失败] ${task.message} (回车清除记录)`;
        action = 'clear_task';
        payload = { jobId: task.id, returnState: 'task_manage' };
      } else if (task.status === 'cancelled') {
        hasDoneOrError = true;
        taskEmoji = '🛑';
        subtitle = `[已取消] ${task.message} (回车清除记录)`;
        action = 'clear_task';
        payload = { jobId: task.id, returnState: 'task_manage' };
      }

      const title = `${taskEmoji} 任务: ${task.name}`;
      if (matchQuery(query, title, subtitle)) {
        items.push(wf.createItem(title, subtitle, action, payload, mods, Icons.task));
      }
    }

    if (hasDoneOrError && matchQuery(query, '清除已完成任务')) {
      items.push(
        wf.createItem('🧹 清除所有已结束任务', '清除所有已完成、失败或取消的任务记录', 'clear_all_tasks', {
          returnState: 'task_manage',
        }, {}, Icons.task)
      );
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', { data: context.data }, {}, Icons.workflow));
    return hasRunning ? { rerun: 1, items } : items;
  });

  /**
   * 状态：选择字典项 (select_dict)
   */
  app.onState('select_dict', async (context, wf) => {
    const dictKey = context['dictKey'] as string ?? '';
    const data = context.data ?? {};
    const pendingAction = context.pendingAction;
    const query = context.query ?? '';
    const items: AlfredItem[] = [];

    let dictItems = await dictService.getDictionaryItems(dictKey);
    const dicts = await dictService.getDictionaries();
    const dictName = dicts.find((d) => d.key === dictKey)?.name ?? dictKey;

    if (query) {
      dictItems = dictItems.filter((item) => matchQuery(query, item.name, item.value));
      dictItems.unshift({ id: `manual_${query}`, name: query, value: query, isManual: true });
    }

    for (const item of dictItems) {
      const newData: ContextData = { ...data, [dictKey]: item };
      const title = item.isManual ? `✏️ 手动输入: ${item.name}` : item.name;
      let subtitle = item.isManual
        ? `将 ${item.name} 设置为当前 ${dictName} (手动输入)`
        : item.value === item.description
          ? (item.value ?? '')
          : `${item.value ?? ''}  ${item.description ?? ''}`;

      if (pendingAction) {
        const feature = features.find((f) => f.id === pendingAction);
        if (!feature) continue;

        const featureIconPath = feature.icon?.path;
        const missingKeys = getMissingKeys(feature, newData);
        const featureName = typeof feature.name === 'function' ? feature.name(newData) : feature.name;
        const featureDescription =
          typeof feature.description === 'function' ? feature.description(newData) : feature.description;

        if (missingKeys.length > 0) {
          const nextDictName = dicts.find((d) => d.key === missingKeys[0])?.name ?? missingKeys[0] ?? '';
          subtitle = `继续配置 ${featureName} (下一步: 选择${nextDictName})`;
          items.push(
            wf.createRerunItem(title, subtitle, 'select_dict', {
              dictKey: missingKeys[0],
              data: newData,
              pendingAction,
            }, {}, featureIconPath)
          );
        } else if (feature.requiredInputs && feature.requiredInputs.length > 0) {
          const nextInput = feature.requiredInputs[0]!;
          subtitle = `继续配置 ${featureName} (下一步: 输入${nextInput.label})`;
          items.push(
            wf.createRerunItem(title, subtitle, 'input_state', {
              data: newData,
              pendingAction,
              inputIndex: 0,
            }, {}, featureIconPath)
          );
        } else {
          subtitle = `执行 [${featureName}]`;
          items.push(
            wf.createItem(title, subtitle, feature.action, {
              data: newData,
              historyTitle: `执行: ${featureName}`,
              historySubtitle: featureDescription,
              recordHistory: feature.recordHistory !== false,
            }, {}, featureIconPath)
          );
        }
      } else {
        items.push(wf.createRerunItem(title, subtitle, 'home', { data: newData }, {}, Icons.context));
      }
    }

    if (matchQuery(query, '返回')) {
      items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', { data }, {}, Icons.workflow));
    }

    return items;
  });

  /**
   * 状态：手动输入参数 (input_state)
   */
  app.onState('input_state', async (context, wf) => {
    const data = context.data ?? {};
    const pendingAction = context.pendingAction;
    const inputIndex = (context.inputIndex as number | undefined) ?? 0;
    const query = context.query ?? '';
    const items: AlfredItem[] = [];

    const feature = features.find((f) => f.id === pendingAction);
    if (!feature || !feature.requiredInputs || !feature.requiredInputs[inputIndex]) {
      return [wf.createRerunItem('❌ 错误', '找不到需要输入的配置项', 'home')];
    }

    const currentInput = feature.requiredInputs[inputIndex]!;
    const isLastInput = inputIndex === feature.requiredInputs.length - 1;

    if (currentInput.fetchOptions) {
      try {
        let options = await currentInput.fetchOptions(query, data);

        if (query) {
          options = options.filter((opt) => matchQuery(query, opt.name, opt.description));
          if (!currentInput.disableManualInput) {
            options.unshift({ name: query, description: '手动输入', isManual: true });
          }
        }

        if (options.length === 0) {
          items.push({
            title: `未找到匹配的 ${currentInput.label}`,
            subtitle: '请尝试其他搜索词',
            valid: false,
          });
        } else {
          const featureIconPath = feature.icon?.path;
          for (const opt of options) {
            const optValue: DictItem = opt.isManual
              ? { name: opt.name, value: opt.name, isManual: true }
              : opt;
            const newData: ContextData = { ...data, [currentInput.key]: optValue };
            const title = opt.isManual ? `✏️ 手动输入: ${opt.name}` : opt.name;
            const subtitle = opt.description ?? `设置为 ${currentInput.label}`;

            const featureName = typeof feature.name === 'function' ? feature.name(newData) : feature.name;
            const featureDescription =
              typeof feature.description === 'function' ? feature.description(newData) : feature.description;

            if (isLastInput) {
              items.push(
                wf.createItem(title, `执行 [${featureName}] - ${subtitle}`, feature.action, {
                  data: newData,
                  historyTitle: `执行: ${featureName}`,
                  historySubtitle: featureDescription,
                  recordHistory: feature.recordHistory !== false,
                }, {}, featureIconPath)
              );
            } else {
              const nextInput = feature.requiredInputs![inputIndex + 1]!;
              items.push(
                wf.createRerunItem(
                  title,
                  `继续配置 ${featureName} (下一步: 输入${nextInput.label}) - ${subtitle}`,
                  'input_state',
                  { data: newData, pendingAction, inputIndex: inputIndex + 1 },
                  {},
                  featureIconPath
                )
              );
            }
          }
        }
      } catch (err) {
        items.push(wf.createItem('❌ 获取选项失败', (err as Error).message, 'open_log'));
      }
    } else {
      // 纯手动输入模式
      const featureIconPath = feature.icon?.path;
      if (query) {
        const newData: ContextData = {
          ...data,
          [currentInput.key]: { name: query, value: query, isManual: true },
        };
        const featureName = typeof feature.name === 'function' ? feature.name(newData) : feature.name;
        const featureDescription =
          typeof feature.description === 'function' ? feature.description(newData) : feature.description;

        if (isLastInput) {
          items.push(
            wf.createItem(`✅ 确认输入: ${query}`, `配置完成，按回车直接执行 [${featureName}]`, feature.action, {
              data: newData,
              historyTitle: `执行: ${featureName}`,
              historySubtitle: featureDescription,
              recordHistory: feature.recordHistory !== false,
            }, {}, featureIconPath)
          );
        } else {
          const nextInput = feature.requiredInputs![inputIndex + 1]!;
          items.push(
            wf.createRerunItem(
              `✅ 确认输入: ${query}`,
              `继续配置 ${featureName} (下一步: 输入${nextInput.label})`,
              'input_state',
              { data: newData, pendingAction, inputIndex: inputIndex + 1 },
              {},
              featureIconPath
            )
          );
        }
      } else {
        items.push({
          title: `✏️ 请输入 ${currentInput.label}`,
          subtitle: currentInput.placeholder ?? '在搜索框中输入内容后按回车',
          icon: featureIconPath ? { path: featureIconPath } : undefined,
          valid: false,
        });
      }
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', { data }, {}, Icons.workflow));
    return items;
  });
}

