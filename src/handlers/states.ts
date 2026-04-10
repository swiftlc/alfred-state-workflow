import dictService from '../services/dictService';
import features from '../config/features';
import CacheManager from '../core/CacheManager';
import {
  DEFAULT_STATE,
  STATE_HOME,
  STATE_PROGRESS,
  STATE_MANAGE,
  STATE_SELECT_DICT,
  STATE_INPUT,
  STATE_SPLIT_FEATURE,
  STATE_HISTORY_MANAGE,
  STATE_TASK_MANAGE,
  STATE_WORKSPACE_MANAGE,
  STATE_WORKSPACE_SAVE,
  STATE_ALIAS_MANAGE,
  STATE_ALIAS_SAVE,
  STATE_ALIAS_RENAME,
  RERUN_INTERVAL_PROGRESS,
  RERUN_INTERVAL_LOADING,
  RERUN_INTERVAL_COMPLETED,
  RERUN_INTERVAL_TASK_LIST,
  FIELD_CURRENT_DICT,
  FIELD_CURRENT_SELECTED,
  FIELD_SILENT_ON_SUCCESS,
  FIELD_PREFETCH_FEATURE_ID,
  FIELD_PREFETCH_INPUT_INDEX,
  FIELD_PREFETCH_DICT_KEY,
} from '../config/constants';
import DictPinManager from '../core/DictPinManager';
import DictRecentManager from '../core/DictRecentManager';
import TaskManager from '../core/TaskManager';
import HistoryManager from '../core/HistoryManager';
import WorkspaceManager, {WorkspaceManager as WorkspaceManagerClass} from '../core/WorkspaceManager';
import AliasManager from '../core/AliasManager';
import {matchQuery} from '../core/utils';
import Icons, {icon} from '../core/icons';
import type Workflow from '../core/Workflow';
import type {AlfredItem, Context, ContextData, DictItem, Feature} from '../types';

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** 检查某个功能还缺少哪些字典上下文 */
function getMissingKeys(feature: Feature, data: ContextData): string[] {
  return feature.requiredKeys.filter((key) => !data[key]);
}

/**
 * 格式化字典条目的副标题：value 与 description 相同时只展示一个，否则用双空格拼接
 */
function formatDictSubtitle(item: { value?: string; description?: string }): string {
  return item.value === item.description
    ? (item.value ?? '')
    : [item.value, item.description].filter(Boolean).join('  ');
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
  app.onState(STATE_PROGRESS, async (context, wf) => {
    const jobId = context.jobId ?? '';
    const task = TaskManager.getTask(jobId);

    if (!task) {
      return [wf.createRerunItem('❌ 错误', '找不到任务信息', DEFAULT_STATE, { data: context.data }, {}, Icons.task)];
    }

    if (task.status === 'running') {
      const spinner = SPINNERS[task.spinnerIdx % SPINNERS.length];
      TaskManager.updateTask(jobId, { spinnerIdx: (task.spinnerIdx ?? 0) + 1 });

      return {
        rerun: RERUN_INTERVAL_PROGRESS,
        items: [
          {
            title: `${spinner} ${task.progress}% - ${task.message}`,
            subtitle: '任务执行中，请稍候... (按回车后台执行，按 Cmd+Enter 取消任务)',
            arg: wf.createItem('', '', 'rerun', { nextState: DEFAULT_STATE, data: context.data }).arg,
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

    const COMPLETED_DISPLAY_MS = wf.taskCompletedDisplayMs;

    if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
      const completedAt = task.completedAt ?? Date.now();
      const elapsed = Date.now() - completedAt;

      const nextState = (context.returnState as string | undefined) ?? DEFAULT_STATE;
      const nextContext: Context = { ...context, state: nextState };
      const fallbackContext: Context = { ...context, state: DEFAULT_STATE };
      const silentOnSuccess = !!(context[FIELD_SILENT_ON_SUCCESS] as boolean | undefined);

      // 成功且静默模式：直接渲染目标状态，不展示成功 item
      if (task.status === 'done' && silentOnSuccess) {
        wf.saveContext(nextContext);
        const handler = wf.states[nextState];
        if (handler) return handler(nextContext, wf);
        return [];
      }

      if (elapsed >= COMPLETED_DISPLAY_MS) {
        if (task.status === 'done') {
          wf.saveContext(nextContext);
          const handler = wf.states[nextState];
          if (handler) return handler(nextContext, wf);
        }
        wf.saveContext(fallbackContext);
        const homeHandler = wf.states[DEFAULT_STATE];
        if (homeHandler) return homeHandler(fallbackContext, wf);
        return [];
      }

      const isSuccess = task.status === 'done';
      const emoji = isSuccess ? '✅' : task.status === 'cancelled' ? '🛑' : '❌';
      const title = isSuccess
        ? `${emoji} ${task.message || '执行完成'}`
        : task.status === 'cancelled'
          ? `${emoji} 任务已取消`
          : `${emoji} 执行失败: ${task.message}`;
      const returnLabel = isSuccess ? `返回${nextState === DEFAULT_STATE ? '主菜单' : ''}` : '返回主菜单';
      const returnArg = isSuccess
        ? wf.createRerunItem('', '', nextState, { data: context.data }).arg
        : wf.createRerunItem('', '', DEFAULT_STATE, { data: context.data }).arg;

      return {
        rerun: RERUN_INTERVAL_COMPLETED,
        items: [
          {
            title,
            subtitle: `按回车${returnLabel}`,
            arg: returnArg,
            valid: true,
            icon: { path: Icons.task },
          } as AlfredItem,
        ],
      };
    }

    // 兜底（理论上不会到达）
    return [wf.createRerunItem('↩️ 返回主菜单', '', DEFAULT_STATE, { data: context.data }, {}, Icons.task)];
  });

  /**
   * 状态：主页 (home)
   */
  app.onState(STATE_HOME, async (context, wf) => {
    const data = context.data ?? {};
    const query = context.query ?? '';
    const items: AlfredItem[] = [];

    // 0. 快捷指令区：仅在 query 以 aliasPrefix 开头时展示
    const aliasPrefix = wf.aliasPrefix;
    if (query.startsWith(aliasPrefix)) {
      const aliasQuery = query.slice(aliasPrefix.length).trim();
      const aliases = AliasManager.getAll();
      const matchedAliases = aliasQuery
        ? aliases.filter(alias => matchQuery(aliasQuery, alias.alias, alias.title))
        : aliases;

      if (matchedAliases.length === 0) {
        items.push({
          title: aliasQuery ? `未找到快捷指令「${aliasQuery}」` : '暂无快捷指令',
          subtitle: '在功能列表中按 Cmd+Enter 可创建快捷指令',
          valid: false,
          icon: { path: Icons.alias },
        });
      } else {
        for (const alias of matchedAliases) {
          items.push(
            wf.createItem(
              `⚡ ${alias.alias}`,
              alias.subtitle || alias.title,
              'execute_alias',
              { aliasId: alias.id, aliasAction: alias.action, aliasData: alias.data },
              {},
              Icons.alias
            )
          );
        }
      }

      return items;
    }

    // 1. 历史记录区
    // query 为空时只展示 1 条最近记录（固定的优先），搜索 h/历史 时展开全部
    const history = HistoryManager.getHistory();
    const pinnedHistory = history.filter((h) => h.isPinned);
    const unpinnedHistory = history.filter((h) => !h.isPinned);
    const isHistoryExpanded = query ? matchQuery(query, '历史', 'h', 'history') : false;
    const displayHistory = isHistoryExpanded
      ? [...pinnedHistory, ...unpinnedHistory]
      : [...pinnedHistory, ...unpinnedHistory.slice(0, wf.maxRecentHistory)];

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

    // 2. 字典选择区
    const dicts = await dictService.getDictionaries();
    for (const dict of dicts) {
      const selected = data[dict.key] as DictItem | undefined;
      const title = selected ? `🏷️ [${dict.name}] ${selected.name}` : `📁 [${dict.name}] 未选择`;
      const subtitle = selected ? '点击重新选择' : '点击选择';

      if (matchQuery(query, dict.name, selected?.name)) {
        items.push(wf.createRerunItem(title, subtitle, STATE_SELECT_DICT, { dictKey: dict.key, data }, {}, Icons.context));
      }
    }

    // 3. 功能矩阵区：就绪功能在前，缺少上下文的配置项沉底
    const readyItems: AlfredItem[] = [];
    const missingItems: AlfredItem[] = [];

    for (const feature of features) {
      if (feature.type === 'split_by_dict') {
        // 计算有多少个字典项可以执行此 feature
        const availableDicts = dicts.filter((dict) => {
          if (feature.excludeKeys?.includes(dict.key)) return false;
          if (feature.excludeWhen?.(dict)) return false;
          return !!(data[dict.key] as DictItem | undefined);
        });
        if (availableDicts.length === 0) continue;

        const featureIconPath = feature.icon?.path;

        // 只有一个可用字典项时，直接内联展示，无需二级跳转
        if (availableDicts.length === 1) {
          const dict = availableDicts[0]!;
          const selected = data[dict.key] as DictItem;
          const contextData: ContextData = {
            ...data,
            [FIELD_CURRENT_DICT]: dict as unknown as DictItem,
            [FIELD_CURRENT_SELECTED]: selected,
          };
          const featureName = typeof feature.name === 'function' ? feature.name(contextData) : feature.name;
          const featureDescription = typeof feature.description === 'function' ? feature.description(contextData) : feature.description;
          const itemTitle = feature.label ?? (typeof feature.name === 'string' ? feature.name : featureName);
          const itemSubtitle = formatDictSubtitle(selected);

          if (!matchQuery(query, itemTitle, featureName, selected.name, itemSubtitle)) continue;

          if (feature.requiredInputs && feature.requiredInputs.length > 0) {
            readyItems.push(
              wf.createRerunItem(itemTitle, itemSubtitle, STATE_INPUT, {
                data: contextData,
                dictKey: dict.key,
                pendingAction: feature.id,
                inputIndex: 0,
              }, {}, featureIconPath)
            );
          } else {
            readyItems.push(
              wf.createItem(itemTitle, itemSubtitle, feature.action, {
                data: contextData,
                dictKey: dict.key,
                historyTitle: featureName,
                historySubtitle: featureDescription,
                recordHistory: feature.recordHistory !== false,
              }, {
                cmd: {
                  subtitle: `⚡ 存为快捷指令: ${featureName}`,
                  action: 'rerun',
                  payload: {
                    nextState: STATE_ALIAS_SAVE,
                    data: contextData,
                    pendingAction: feature.action,
                    aliasTitle: featureName,
                    aliasSubtitle: featureDescription,
                  },
                },
              }, featureIconPath)
            );
          }
          continue;
        }

        // 多个可用字典项时，聚合为一个入口进入二级菜单
        const entryTitle = feature.label
          ?? (typeof feature.name === 'string' ? feature.name : feature.id);
        const entrySubtitle = availableDicts.map((d) => (data[d.key] as DictItem).name).join(' / ');

        if (!matchQuery(query, entryTitle, entrySubtitle)) continue;

        readyItems.push(
          wf.createRerunItem(entryTitle, entrySubtitle, STATE_SPLIT_FEATURE, {
            data,
            pendingFeatureId: feature.id,
          }, {}, featureIconPath)
        );
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
          readyItems.push(
            wf.createRerunItem(
              `${featureName}`,
              `${featureDescription}`,
              STATE_INPUT,
              { data, pendingAction: feature.id, inputIndex: 0 },
              {},
              featureIconPath
            )
          );
        } else {
          readyItems.push(
            wf.createItem(` ${featureName}`, featureDescription, feature.action, {
              data,
              historyTitle: `${featureName}`,
              historySubtitle: featureDescription,
              recordHistory: feature.recordHistory !== false,
            }, {
              cmd: {
                subtitle: `⚡ 存为快捷指令: ${featureName}`,
                action: 'rerun',
                payload: {
                  nextState: STATE_ALIAS_SAVE,
                  data,
                  pendingAction: feature.action,
                  aliasTitle: featureName,
                  aliasSubtitle: featureDescription,
                },
              },
            }, featureIconPath)
          );
        }
      } else {
        const missingNames = dicts
          .filter((d) => missingKeys.includes(d.key))
          .map((d) => d.name)
          .join(', ');
        missingItems.push(
          wf.createRerunItem(
            `⚙️ 配置: ${featureName}`,
            `缺少上下文: ${missingNames} (点击开始配置)`,
            STATE_SELECT_DICT,
            { dictKey: missingKeys[0], data, pendingAction: feature.id },
            {},
            featureIconPath
          )
        );
      }
    }

    items.push(...readyItems, ...missingItems);

    // 3.5 空状态引导语：无 query、无历史、无任何功能条目时展示
    if (!query && items.length === 0) {
      items.push({
        title: '👋 从选择字典开始',
        subtitle: '选择上方字典后功能列表将自动出现，或输入 > 使用快捷指令',
        valid: false,
        icon: { path: Icons.workflow },
      });
    }

    // 4. 管理中心入口（汇聚所有管理类操作，避免干扰主流程）
    const tasks = TaskManager.getAllTasks();
    const runningCount = tasks.filter((t) => t.status === 'running').length;
    const manageBadges: string[] = [];
    if (runningCount > 0) manageBadges.push(`${runningCount}个任务运行中`);
    const manageSubtitle = manageBadges.length > 0
      ? `历史 / 任务 / 工作区 / 快捷指令  ·  ${manageBadges.join('  ')}`
      : '历史 / 任务 / 工作区 / 快捷指令';

    if (matchQuery(query, '管理', STATE_MANAGE, '历史', '任务', '工作区', '快捷指令', '缓存', '上下文')) {
      items.push(wf.createRerunItem('⚙️ 管理', manageSubtitle, STATE_MANAGE, { data }, {}, Icons.workflow));
    }

    return items;
  });

  /**
   * 状态：管理中心 (manage)
   * 汇聚历史记录、任务中心、工作区、快捷指令、清空上下文、刷新缓存等管理类操作
   */
  app.onState(STATE_MANAGE, async (context, wf) => {
    const query = context.query ?? '';
    const data = context.data ?? {};
    const items: AlfredItem[] = [];

    // 历史记录
    const history = HistoryManager.getHistory();
    if (matchQuery(query, '历史记录', 'history')) {
      items.push(
        wf.createRerunItem(
          '📚 历史记录',
          `共 ${history.length} 条记录`,
          STATE_HISTORY_MANAGE,
          { data },
          {},
          Icons.history
        )
      );
    }

    // 任务中心
    const tasks = TaskManager.getAllTasks();
    if (matchQuery(query, '任务中心', 'task')) {
      const runningCount = tasks.filter((t) => t.status === 'running').length;
      const taskTitle = runningCount > 0
        ? `⏳ 任务中心 (${runningCount}个运行中)`
        : `📋 任务中心`;
      const taskSubtitle = tasks.length > 0
        ? `共 ${tasks.length} 条任务记录`
        : '暂无后台任务';
      items.push(wf.createRerunItem(taskTitle, taskSubtitle, STATE_TASK_MANAGE, { data }, {}, Icons.task));
    }

    // 工作区管理
    if (matchQuery(query, '工作区', 'workspace')) {
      const workspaces = WorkspaceManager.getAll();
      const wsSubtitle = workspaces.length > 0
        ? `已保存 ${workspaces.length} 个工作区`
        : '保存当前上下文为工作区，下次一键恢复';
      items.push(
        wf.createRerunItem('🗂️ 工作区管理', wsSubtitle, STATE_WORKSPACE_MANAGE, { data }, {}, Icons.workspace)
      );
    }

    // 快捷指令管理
    if (matchQuery(query, '快捷指令', '指令', 'alias')) {
      const aliases = AliasManager.getAll();
      const aliasSubtitle = aliases.length > 0
        ? `已保存 ${aliases.length} 条快捷指令`
        : '将功能操作绑定为触发词，一步直达执行';
      items.push(
        wf.createRerunItem('⚡ 快捷指令', aliasSubtitle, STATE_ALIAS_MANAGE, { data }, {}, Icons.alias)
      );
    }

    // 清空上下文
    if (Object.keys(data).filter((k) => !k.startsWith('_')).length > 0 && matchQuery(query, '清空上下文')) {
      items.push(
        wf.createRerunItem('🗑️ 清空上下文', '清除所有已选择的字典数据，重新开始', DEFAULT_STATE, { data: {} }, {}, Icons.context)
      );
    }

    // 强制刷新缓存
    if (matchQuery(query, '刷新缓存', 'refresh')) {
      items.push(
        wf.createItem('🔄 强制刷新缓存', '清除本地字典缓存并重新获取', 'refresh_cache', { data }, {}, Icons.cache)
      );
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', DEFAULT_STATE, { data }, {}, Icons.workflow));
    return items;
  });

  /**
   * 状态：split_by_dict 功能二级展开 (split_feature)
   * 展示某个 split_by_dict feature 下所有字典项的具体操作条目
   */
  app.onState(STATE_SPLIT_FEATURE, async (context, wf) => {
    const query = context.query ?? '';
    const data = context.data ?? {};
    const pendingFeatureId = context['pendingFeatureId'] as string | undefined;
    const items: AlfredItem[] = [];

    const feature = features.find((f) => f.id === pendingFeatureId);
    if (!feature || !pendingFeatureId) {
      const homeHandler = wf.states[DEFAULT_STATE];
      if (homeHandler) return homeHandler({ ...context, state: DEFAULT_STATE, query }, wf);
      return [];
    }

    const dicts = await dictService.getDictionaries();

    for (const dict of dicts) {
      if (feature.excludeKeys?.includes(dict.key)) continue;
      if (feature.excludeWhen?.(dict)) continue;
      const selected = data[dict.key] as DictItem | undefined;
      if (!selected) continue;

      const contextData: ContextData = {
        ...data,
        [FIELD_CURRENT_DICT]: dict as unknown as DictItem,
        [FIELD_CURRENT_SELECTED]: selected,
      };
      const featureName = typeof feature.name === 'function' ? feature.name(contextData) : feature.name;
      const featureDescription =
        typeof feature.description === 'function' ? feature.description(contextData) : feature.description;

      // 展示字典项本身的信息，不重复展示功能名称
      const itemTitle = selected.name;
      const itemSubtitle = formatDictSubtitle(selected);

      if (!matchQuery(query, selected.name, selected.value, selected.description)) continue;

      const featureIconPath = feature.icon?.path;
      if (feature.requiredInputs && feature.requiredInputs.length > 0) {
        items.push(
          wf.createRerunItem(itemTitle, itemSubtitle, STATE_INPUT, {
            data: contextData,
            dictKey: dict.key,
            pendingAction: feature.id,
            inputIndex: 0,
          }, {}, featureIconPath)
        );
      } else {
        items.push(
          wf.createItem(itemTitle, itemSubtitle, feature.action, {
            data: contextData,
            dictKey: dict.key,
            historyTitle: featureName,
            historySubtitle: featureDescription,
            recordHistory: feature.recordHistory !== false,
          }, {
            cmd: {
              subtitle: `⚡ 存为快捷指令: ${featureName}`,
              action: 'rerun',
              payload: {
                nextState: STATE_ALIAS_SAVE,
                data: contextData,
                pendingAction: feature.action,
                aliasTitle: featureName,
                aliasSubtitle: featureDescription,
              },
            },
          }, featureIconPath)
        );
      }
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', DEFAULT_STATE, { data }, {}, Icons.workflow));
    return items;
  });

  /**
   * 状态：历史记录管理 (history_manage)
   */
  app.onState(STATE_HISTORY_MANAGE, async (context, wf) => {
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
                payload: { id: record.id, returnState: STATE_HISTORY_MANAGE },
              },
              alt: {
                subtitle: '删除此记录',
                action: 'delete_history',
                payload: { id: record.id, returnState: STATE_HISTORY_MANAGE },
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

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', DEFAULT_STATE, { data: context.data }, {}, Icons.workflow));
    return items;
  });

  /**
   * 状态：任务管理 (task_manage)
   */
  app.onState(STATE_TASK_MANAGE, async (context, wf) => {
    const query = context.query ?? '';
    const items: AlfredItem[] = [];
    const tasks = TaskManager.getAllTasks();

    if (tasks.length === 0) {
      return [wf.createRerunItem('暂无后台任务', '按回车返回主菜单', DEFAULT_STATE, { data: context.data })];
    }

    let hasRunning = false;
    let hasDoneOrError = false;

    for (const task of tasks) {
      let taskEmoji = '⏳';
      let subtitle = '';
      let action = 'rerun';
      let payload: Record<string, unknown> = { nextState: STATE_PROGRESS, jobId: task.id, data: context.data };
      let mods: Record<string, { subtitle: string; action: string; payload: Record<string, unknown> }> = {};

      if (task.status === 'running') {
        hasRunning = true;
        taskEmoji = SPINNERS[(task.spinnerIdx ?? 0) % SPINNERS.length]!;
        subtitle = `[运行中] ${task.progress}% - ${task.message} (回车查看进度，Cmd取消)`;
        mods = {
          cmd: {
            subtitle: '🛑 取消任务',
            action: 'cancel_task',
            payload: { jobId: task.id, returnState: STATE_TASK_MANAGE },
          },
        };
      } else if (task.status === 'done') {
        hasDoneOrError = true;
        taskEmoji = '✅';
        subtitle = `[已完成] ${task.message} (回车清除记录)`;
        action = 'clear_task';
        payload = { jobId: task.id, returnState: STATE_TASK_MANAGE };
      } else if (task.status === 'error') {
        hasDoneOrError = true;
        taskEmoji = '❌';
        subtitle = `[失败] ${task.message} (回车清除记录)`;
        action = 'clear_task';
        payload = { jobId: task.id, returnState: STATE_TASK_MANAGE };
      } else if (task.status === 'cancelled') {
        hasDoneOrError = true;
        taskEmoji = '🛑';
        subtitle = `[已取消] ${task.message} (回车清除记录)`;
        action = 'clear_task';
        payload = { jobId: task.id, returnState: STATE_TASK_MANAGE };
      }

      const title = `${taskEmoji} 任务: ${task.name}`;
      if (matchQuery(query, title, subtitle)) {
        items.push(wf.createItem(title, subtitle, action, payload, mods, Icons.task));
      }
    }

    if (hasDoneOrError && matchQuery(query, '清除已完成任务')) {
      items.push(
        wf.createItem('🧹 清除所有已结束任务', '清除所有已完成、失败或取消的任务记录', 'clear_all_tasks', {
          returnState: STATE_TASK_MANAGE,
        }, {}, Icons.task)
      );
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', DEFAULT_STATE, { data: context.data }, {}, Icons.workflow));
    return hasRunning ? { rerun: RERUN_INTERVAL_TASK_LIST, items } : items;
  });

  /**
   * 状态：选择字典项 (select_dict)
   */
  app.onState(STATE_SELECT_DICT, async (context, wf) => {
    const dictKey = context['dictKey'] as string ?? '';
    const data = context.data ?? {};
    const pendingAction = context.pendingAction;
    const query = context.query ?? '';
    const items: AlfredItem[] = [];

    // dictKey 缺失时（如 esc 后重新打开 Alfred，context 残留了 select_dict 状态），回退到 home
    if (!dictKey) {
      const homeHandler = wf.states[DEFAULT_STATE];
      if (homeHandler) return homeHandler({ ...context, state: DEFAULT_STATE, query }, wf);
      return [];
    }

    // 非阻塞加载：优先读缓存，缓存未命中则展示 loading 并启动后台预加载
    const cached = await dictService.getCachedItems(dictKey);
    const dicts = await dictService.getDictionaries();

    if (cached === null) {
      // 缓存未命中：静默启动后台预加载 worker，展示 loading item，rerun 轮询直到缓存就绪
      wf.spawnWorker('_prefetch_dict', { ...context, [FIELD_PREFETCH_DICT_KEY]: dictKey });
      const dictName = dicts.find((d) => d.key === dictKey)?.name ?? dictKey;
      const spinner = SPINNERS[Math.floor(Date.now() / 200) % SPINNERS.length]!;
      return {
        rerun: RERUN_INTERVAL_LOADING,
        items: [
          {
            title: `${spinner} 正在加载${dictName}列表...`,
            subtitle: '数据加载中，请稍候',
            valid: false,
            icon: { path: Icons.context },
          } as AlfredItem,
        ],
      };
    }

    let dictItems = cached;
    const dictName = dicts.find((d) => d.key === dictKey)?.name ?? dictKey;

    const dictConfig = dicts.find((d) => d.key === dictKey);
    const pinnedMap = DictPinManager.getAll();
    const recentMap = DictRecentManager.getRecentMap(dictKey);
    const pinKey = (item: { id?: string; name: string }) => `${dictKey}:${item.id ?? item.name}`;
    const itemKey = (item: { id?: string; name: string }) => item.id ?? item.name;

    // 当前已选中的条目 id/name
    const currentSelected = data[dictKey] as DictItem | undefined;
    const currentKey = currentSelected ? (currentSelected.id ?? currentSelected.name) : null;

    if (query) {
      dictItems = dictItems.filter((item) => matchQuery(query, item.name, item.value));
      dictItems.unshift({ id: `manual_${query}`, name: query, value: query, isManual: true });
    } else {
      // 无搜索词时：已选中 > pin 置顶 > 最近使用时间 > 原始顺序
      dictItems.sort((a, b) => {
        const aKey = itemKey(a);
        const bKey = itemKey(b);
        const aIsCurrent = aKey === currentKey;
        const bIsCurrent = bKey === currentKey;
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;

        const aPinned = !!pinnedMap[pinKey(a)];
        const bPinned = !!pinnedMap[pinKey(b)];
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        const aRecent = recentMap[aKey] ?? 0;
        const bRecent = recentMap[bKey] ?? 0;
        return bRecent - aRecent;
      });
    }

    for (const item of dictItems) {
      const newData: ContextData = { ...data, [dictKey]: item };
      const isPinned = !item.isManual && !!pinnedMap[pinKey(item)];
      const isCurrentlySelected = !item.isManual && itemKey(item) === currentKey;

      // 标题前缀：当前已选 > pin > 普通
      const titlePrefix = isCurrentlySelected ? '✓ ' : isPinned ? '📌 ' : '';
      const title = item.isManual ? `✏️ 手动输入: ${item.name}` : `${titlePrefix}${item.name}`;
      let subtitle = item.isManual
        ? `将 ${item.name} 设置为当前 ${dictName} (手动输入)`
        : formatDictSubtitle(item);

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
          subtitle = `(下一步: 选择${nextDictName})`;
          items.push(
            wf.createRerunItem(title, subtitle, STATE_SELECT_DICT, {
              dictKey: missingKeys[0],
              data: newData,
              pendingAction,
            }, {}, featureIconPath)
          );
        } else if (feature.requiredInputs && feature.requiredInputs.length > 0) {
          const nextInput = feature.requiredInputs[0]!;
          subtitle = `(下一步: 输入${nextInput.label})`;
          items.push(
            wf.createRerunItem(title, subtitle, STATE_INPUT, {
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
        const canModify = !item.isManual;
        const canDelete = canModify && !dictConfig?.readonly && !!item.id;
        const mods: Record<string, { subtitle: string; action: string; payload: Record<string, unknown> }> = {};
        const hints: string[] = [];

        if (canModify) {
          mods['cmd'] = {
            subtitle: isPinned ? '取消置顶' : '📌 置顶此条目',
            action: 'toggle_pin_dict_item',
            payload: { dictPinKey: pinKey(item), dictKey, data },
          };
          hints.push('[Cmd] ' + (isPinned ? '取消置顶' : '置顶'));
        }
        if (canDelete) {
          mods['alt'] = {
            subtitle: '🗑️ 删除此条目',
            action: 'delete_dict_item',
            payload: { dictItemId: item.id, dictKey, dictItemName: item.name, data },
          };
          hints.push('[Alt] 删除');
        }

        const itemSubtitle = hints.length > 0 ? `${subtitle}  ${hints.join('  ')}` : subtitle;
        // 选择条目时记录最近使用，并跳转 home
        items.push(wf.createItem(title, itemSubtitle, 'select_dict_item', {
          dictKey,
          dictItemKey: itemKey(item),
          data: newData,
        }, mods, Icons.context));
      }
    }

    if (matchQuery(query, '返回')) {
      items.push(wf.createRerunItem('🔙 返回', '返回主菜单', DEFAULT_STATE, { data }, {}, Icons.workflow));
    }

    return items;
  });

  /**
   * 状态：手动输入参数 (input_state)
   */
  app.onState(STATE_INPUT, async (context, wf) => {
    let data = context.data ?? {};
    const pendingAction = context.pendingAction;
    let inputIndex = (context.inputIndex as number | undefined) ?? 0;
    const query = context.query ?? '';
    const items: AlfredItem[] = [];

    /** 构造存为快捷指令的 cmd mod，传入当前已收集完整 data 快照 */
    const makeAliasMod = (featureName: string, featureDescription: string, snapData: ContextData) => ({
      cmd: {
        subtitle: `⚡ 存为快捷指令: ${featureName}`,
        action: 'rerun',
        payload: {
          nextState: STATE_ALIAS_SAVE,
          data: snapData,
          pendingAction: feature!.action,
          aliasTitle: featureName,
          aliasSubtitle: featureDescription,
        },
      },
    });

    const feature = features.find((f) => f.id === pendingAction);
    if (!feature || !feature.requiredInputs || !feature.requiredInputs[inputIndex]) {
      return [wf.createRerunItem('❌ 错误', '找不到需要输入的配置项', DEFAULT_STATE)];
    }

    // 跳过满足 skipIf 条件的步骤
    let currentInput = feature.requiredInputs[inputIndex]!;
    while (currentInput.skipIf?.(data)) {
      inputIndex++;
      if (!feature.requiredInputs[inputIndex]) {
        // 所有后续步骤都被跳过，直接执行 action
        return [wf.createItem('▶️ 执行', '条件已满足，直接执行', feature.action, { data })];
      }
      currentInput = feature.requiredInputs[inputIndex]!;
    }

    const isLastInput = inputIndex === feature.requiredInputs.length - 1;

    if (currentInput.fetchOptions) {
      const featureIconPath = feature.icon?.path;
      const resolvedCacheKey = currentInput.cacheKey?.(data);

      // 有 cacheKey：走非阻塞加载模式
      if (resolvedCacheKey) {
        const cached = await CacheManager.get<DictItem[]>(resolvedCacheKey);

        if (cached === null) {
          // 缓存未命中，启动后台 task 发起请求，自动跳转 progress 状态展示加载进度
          wf.startTask('_prefetch_options', {
            ...context,
            returnState: STATE_INPUT,
            [FIELD_SILENT_ON_SUCCESS]: true,
            [FIELD_PREFETCH_FEATURE_ID]: pendingAction,
            [FIELD_PREFETCH_INPUT_INDEX]: inputIndex,
          });
          return [];
        }

        // 缓存命中，走正常渲染逻辑
        let options = cached;
        if (query) {
          options = options.filter((opt) => matchQuery(query, opt.name, opt.description));
          if (!currentInput.disableManualInput) {
            options.unshift({ name: query, description: '手动输入', isManual: true });
          }
        }

        if (options.length === 0) {
          if (query) {
            items.push({ title: `未找到匹配的 ${currentInput.label}`, subtitle: '请尝试其他搜索词', valid: false });
          } else {
            // 无搜索词但结果为空，说明接口返回空数据，提供重试入口并清除缓存
            if (resolvedCacheKey) CacheManager.clear(resolvedCacheKey);
            items.push(
              wf.createRerunItem(
                '⚠️ 加载失败，点击重试',
                `${currentInput.label} 数据为空，点击重新加载`,
                STATE_INPUT,
                { data, pendingAction, inputIndex },
                {},
                featureIconPath
              )
            );
          }
        } else {
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
                wf.createItem(title, `[${featureName}] - ${subtitle}`, feature.action, {
                  data: newData,
                  historyTitle: `${featureName}`,
                  historySubtitle: featureDescription,
                  recordHistory: feature.recordHistory !== false,
                }, makeAliasMod(featureName, featureDescription, newData), featureIconPath)
              );
            } else {
              items.push(
                wf.createRerunItem(
                  title,
                  `${featureName} - ${subtitle}`,
                  STATE_INPUT,
                  { data: newData, pendingAction, inputIndex: inputIndex + 1 },
                  makeAliasMod(featureName, featureDescription, newData),
                  featureIconPath
                )
              );
            }
          }
        }
      } else {
        // 无 cacheKey：原有同步阻塞逻辑（向下兼容）
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
                  wf.createItem(title, `[${featureName}] - ${subtitle}`, feature.action, {
                    data: newData,
                    historyTitle: `${featureName}`,
                    historySubtitle: featureDescription,
                    recordHistory: feature.recordHistory !== false,
                  }, makeAliasMod(featureName, featureDescription, newData), featureIconPath)
                );
              } else {
                items.push(
                  wf.createRerunItem(
                    title,
                    `${featureName} - ${subtitle}`,
                    STATE_INPUT,
                    { data: newData, pendingAction, inputIndex: inputIndex + 1 },
                    makeAliasMod(featureName, featureDescription, newData),
                    featureIconPath
                  )
                );
              }
            }
          }
        } catch (err) {
          items.push(
            wf.createRerunItem(
              '⚠️ 加载失败，点击重试',
              (err as Error).message,
              STATE_INPUT,
              { data, pendingAction, inputIndex },
              {},
              featureIconPath
            )
          );
        }
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
              historyTitle: `${featureName}`,
              historySubtitle: featureDescription,
              recordHistory: feature.recordHistory !== false,
            }, makeAliasMod(featureName, featureDescription, newData), featureIconPath)
          );
        } else {
          const nextInput = feature.requiredInputs![inputIndex + 1]!;
          items.push(
            wf.createRerunItem(
              `✅ 确认输入: ${query}`,
              `继续配置 ${featureName} (下一步: 输入${nextInput.label})`,
              STATE_INPUT,
              { data: newData, pendingAction, inputIndex: inputIndex + 1 },
              makeAliasMod(featureName, featureDescription, newData),
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

    // 上一步：inputIndex > 0 时展示，清除从上一步起收集的 data key，回退重新选择
    if (inputIndex > 0) {
      const prevIndex = inputIndex - 1;
      const keysToRemove = feature.requiredInputs!.slice(prevIndex).map((inp) => inp.key);
      const prevData = { ...data };
      for (const k of keysToRemove) delete prevData[k];
      const prevInput = feature.requiredInputs![prevIndex]!;
      items.push(
        wf.createRerunItem(
          `← 上一步: ${prevInput.label}`,
          `重新选择「${prevInput.label}」`,
          STATE_INPUT,
          { data: prevData, pendingAction, inputIndex: prevIndex },
          {},
          Icons.workflow
        )
      );
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', DEFAULT_STATE, { data }, {}, Icons.workflow));
    return items;
  });

  /**
   * 状态：工作区管理 (workspace_manage)
   * 展示所有已保存的工作区快照，支持加载和删除
   */
  app.onState(STATE_WORKSPACE_MANAGE, async (context, wf) => {
    const query = context.query ?? '';
    const items: AlfredItem[] = [];
    const workspaces = WorkspaceManager.getAll();

    // 保存当前上下文为新工作区入口（有上下文数据时才展示）
    const currentData = context.data ?? {};
    const hasData = Object.keys(currentData).filter((k) => !k.startsWith('_')).length > 0;
    if (hasData && matchQuery(query, '保存', '新建', '当前上下文')) {
      const suggestedName = WorkspaceManagerClass.suggestName(currentData);
      items.push(
        wf.createRerunItem(
          '💾 将当前上下文保存为工作区...',
          `当前: ${suggestedName}  (点击进入命名)`,
          STATE_WORKSPACE_SAVE,
          { data: currentData },
          {},
          Icons.workspace
        )
      );
    }

    if (workspaces.length === 0) {
      items.push({
        title: '暂无保存的工作区',
        subtitle: '选择上方「保存当前上下文」来创建第一个工作区',
        valid: false,
        icon: icon('workspace'),
      });
    } else {
      for (const ws of workspaces) {
        const contextSummary = WorkspaceManagerClass.suggestName(ws.data);
        const usageText = ws.usageCount > 0 ? `用了 ${ws.usageCount} 次` : '未使用过';
        const title = `📂 ${ws.name}`;
        const subtitle = `${contextSummary}  ·  ${usageText}`;

        if (!matchQuery(query, ws.name, contextSummary)) continue;

        items.push(
          wf.createItem(
            title,
            subtitle,
            'load_workspace',
            { workspaceId: ws.id, data: ws.data },
            {
              alt: {
                subtitle: '🗑️ 删除此工作区',
                action: 'delete_workspace',
                payload: { workspaceId: ws.id, returnState: STATE_WORKSPACE_MANAGE, data: currentData },
              },
            },
            Icons.workspace
          )
        );
      }
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', DEFAULT_STATE, { data: currentData }, {}, Icons.workflow));
    return items;
  });

  /**
   * 状态：命名并保存工作区 (workspace_save)
   * 用户在搜索框输入工作区名称后回车保存
   */
  app.onState(STATE_WORKSPACE_SAVE, async (context, wf) => {
    const query = context.query ?? '';
    const data = context.data ?? {};
    const items: AlfredItem[] = [];
    const suggestedName = WorkspaceManagerClass.suggestName(data);

    if (query) {
      // 用户已输入名称，展示确认保存选项
      items.push(
        wf.createItem(
          `💾 保存为「${query}」`,
          `将当前上下文快照保存为工作区: ${suggestedName}`,
          'save_workspace',
          { workspaceName: query, data },
          {},
          Icons.workspace
        )
      );

      // 检查是否有同名工作区，给出覆盖提示
      const existing = WorkspaceManager.getAll().find((w) => w.name === query);
      if (existing) {
        items.push({
          title: `⚠️ 已存在同名工作区「${query}」`,
          subtitle: '回车将覆盖原有内容',
          valid: false,
          icon: icon('workspace'),
        });
      }
    } else {
      // 等待用户输入名称
      items.push({
        title: `✏️ 请输入工作区名称`,
        subtitle: `建议名称: ${suggestedName}  (在搜索框输入后回车保存)`,
        valid: false,
        icon: icon('workspace'),
      });

      // 快速使用建议名称保存
      items.push(
        wf.createItem(
          `💾 使用建议名称「${suggestedName}」保存`,
          '直接回车以建议名称保存工作区',
          'save_workspace',
          { workspaceName: suggestedName, data },
          {},
          Icons.workspace
        )
      );
    }

    items.push(wf.createRerunItem('🔙 返回', '返回工作区列表', STATE_WORKSPACE_MANAGE, { data }, {}, Icons.workspace));
    return items;
  });

  /**
   * 状态：快捷指令管理 (alias_manage)
   * 展示所有已保存的快捷指令，支持执行和删除
   */
  app.onState(STATE_ALIAS_MANAGE, async (context, wf) => {
    const query = context.query ?? '';
    const items: AlfredItem[] = [];
    const allAliases = AliasManager.getAll();
    const currentData = context.data ?? {};

    if (allAliases.length === 0) {
      items.push({
        title: '暂无快捷指令',
        subtitle: '在主菜单功能列表中，对任意功能按 Cmd+Enter 即可创建快捷指令',
        valid: false,
        icon: icon('alias'),
      });
    } else {
      for (const alias of allAliases) {
        const usageText = alias.usageCount > 0 ? `已执行 ${alias.usageCount} 次` : '从未执行';
        const title = `⚡ ${alias.alias}`;
        const subtitle = `${alias.title}  ·  ${usageText}`;

        if (!matchQuery(query, alias.alias, alias.title)) continue;

        items.push(
          wf.createItem(
            title,
            subtitle,
            'execute_alias',
            { aliasId: alias.id, aliasAction: alias.action, aliasData: alias.data },
            {
              cmd: {
                subtitle: '✏️ 重命名触发词',
                action: 'rerun',
                payload: { nextState: STATE_ALIAS_RENAME, aliasId: alias.id, aliasCurrentName: alias.alias, data: currentData },
              },
              alt: {
                subtitle: '🗑️ 删除此快捷指令',
                action: 'delete_alias',
                payload: { aliasId: alias.id, returnState: STATE_ALIAS_MANAGE, data: currentData },
              },
            },
            Icons.alias
          )
        );
      }
    }

    items.push(wf.createRerunItem('🔙 返回', '返回主菜单', DEFAULT_STATE, { data: currentData }, {}, Icons.workflow));
    return items;
  });

  /**
   * 状态：创建快捷指令 (alias_save)
   * 用户输入触发词后，提示确认保存
   * 必须携带 pendingAction + aliasTitle 才有实际意义
   */
  app.onState(STATE_ALIAS_SAVE, async (context, wf) => {
    const query = context.query ?? '';
    const data = context.data ?? {};
    const pendingAction = context['pendingAction'] as string | undefined;
    const aliasTitle = context['aliasTitle'] as string | undefined;
    const aliasSubtitle = context['aliasSubtitle'] as string | undefined;
    const items: AlfredItem[] = [];

    // 如果没有 pendingAction，说明不是从功能 item 进入的，提示用户先选择一个功能
    if (!pendingAction) {
      items.push({
        title: '⚠️ 请先选择要绑定的操作',
        subtitle: '在主菜单功能列表中，对想要绑定的功能按 Cmd+Enter 创建快捷指令',
        valid: false,
        icon: icon('alias'),
      });
      items.push(wf.createRerunItem('🔙 返回', '返回别名列表', STATE_ALIAS_MANAGE, { data }, {}, Icons.alias));
      return items;
    }

    // 展示将要绑定的操作信息
    items.push({
      title: `📌 将绑定: ${aliasTitle ?? pendingAction}`,
      subtitle: aliasSubtitle ?? `Action: ${pendingAction}`,
      valid: false,
      icon: icon('alias'),
    });

    if (query) {
      // 检查是否为有效的别名（不包含空格，主要用于快速触发）
      const trimmedQuery = query.trim();
      if (trimmedQuery.includes(' ')) {
        items.push({
          title: '❌ 别名不能包含空格',
          subtitle: '请输入不含空格的短词（如 lgd、dev-login）',
          valid: false,
          icon: icon('alias'),
        });
      } else {
        // 展示确认保存选项
        items.push(
          wf.createItem(
            `⚡ 保存为「${trimmedQuery}」`,
            `触发词 "${trimmedQuery}" → ${aliasTitle ?? pendingAction}`,
            'save_alias',
            { aliasName: trimmedQuery, data, pendingAction, aliasTitle, aliasSubtitle },
            {},
            Icons.alias
          )
        );

        // 检查是否有同名别名，给出覆盖提示
        const existing = AliasManager.getAll().find((a) => a.alias === trimmedQuery);
        if (existing) {
          items.push({
            title: `⚠️ 已存在同名别名「${trimmedQuery}」`,
            subtitle: `将覆盖原绑定: ${existing.title}`,
            valid: false,
            icon: icon('alias'),
          });
        }
      }
    } else {
      // 等待用户输入别名
      items.push({
        title: `✏️ 请输入触发词`,
        subtitle: `输入不含空格的短词（如 lgd、dev-auth），回车保存`,
        valid: false,
        icon: icon('alias'),
      });
    }

    items.push(wf.createRerunItem('🔙 返回', '返回快捷指令列表', STATE_ALIAS_MANAGE, { data }, {}, Icons.alias));
    return items;
  });

  /**
   * 状态：重命名快捷指令触发词 (alias_rename)
   * 用户输入新触发词后确认保存
   */
  app.onState(STATE_ALIAS_RENAME, async (context, wf) => {
    const query = context.query ?? '';
    const data = context.data ?? {};
    const aliasId = context['aliasId'] as string | undefined;
    const aliasCurrentName = context['aliasCurrentName'] as string | undefined;
    const items: AlfredItem[] = [];

    if (!aliasId) {
      items.push({ title: '⚠️ 参数缺失', subtitle: '无法找到要重命名的快捷指令', valid: false, icon: icon('alias') });
      items.push(wf.createRerunItem('🔙 返回', '返回快捷指令列表', STATE_ALIAS_MANAGE, { data }, {}, Icons.alias));
      return items;
    }

    items.push({
      title: `✏️ 重命名「${aliasCurrentName}」`,
      subtitle: '在搜索框输入新触发词后回车保存',
      valid: false,
      icon: icon('alias'),
    });

    if (query) {
      const trimmed = query.trim();
      if (trimmed.includes(' ')) {
        items.push({
          title: '❌ 触发词不能包含空格',
          subtitle: '请输入不含空格的短词（如 lgd、dev-login）',
          valid: false,
          icon: icon('alias'),
        });
      } else {
        items.push(
          wf.createItem(
            `⚡ 重命名为「${trimmed}」`,
            `${aliasCurrentName} → ${trimmed}`,
            'rename_alias',
            { aliasId, aliasNewName: trimmed, data },
            {},
            Icons.alias
          )
        );

        const conflict = AliasManager.getAll().find((a) => a.alias === trimmed && a.id !== aliasId);
        if (conflict) {
          items.push({
            title: `⚠️ 触发词「${trimmed}」已被「${conflict.title}」占用`,
            subtitle: '保存后将覆盖原有绑定',
            valid: false,
            icon: icon('alias'),
          });
        }
      }
    }

    items.push(wf.createRerunItem('🔙 返回', '返回快捷指令列表', STATE_ALIAS_MANAGE, { data }, {}, Icons.alias));
    return items;
  });
}

