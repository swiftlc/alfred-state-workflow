import {execSync} from 'child_process';
import {copyToClipboard, encodeContext, openUrl, resolveOptions, sendNotification} from '../core/utils';
import CacheManager from '../core/CacheManager';
import DictPinManager from '../core/DictPinManager';
import DictRecentManager from '../core/DictRecentManager';
import {http} from '../core/HttpClient';
import HistoryManager from '../core/HistoryManager';
import TaskManager from '../core/TaskManager';
import WorkspaceManager from '../core/WorkspaceManager';
import AliasManager from '../core/AliasManager';
import Logger from '../core/Logger';
import dictService, {DictService} from '../services/dictService';
import {
  PROXY_BASE_URL,
  DEFAULT_STATE,
  STATE_SELECT_DICT,
  STATE_TASK_MANAGE,
  STATE_WORKSPACE_MANAGE,
  STATE_ALIAS_MANAGE,
  FIELD_CURRENT_SELECTED,
  FIELD_CURRENT_DICT,
  FIELD_PREFETCH_DICT_KEY,
  FIELD_PREFETCH_FEATURE_ID,
  FIELD_PREFETCH_INPUT_INDEX,
} from '../config/constants';
import type Workflow from '../core/Workflow';
import type {DictItem} from '../types';

/**
 * 注册所有执行动作
 * 对应 src/config/features.ts 中的 action 字段
 */
export default function registerActions(app: Workflow): void {
  // 后台任务：预加载字典列表数据并写入缓存
  app.onTask('_prefetch_dict', async (task, context) => {
    const dictKey = context[FIELD_PREFETCH_DICT_KEY] as string | undefined;
    if (!dictKey) {
      task.update(100, '参数缺失');
      return;
    }
    task.update(10, '正在加载字典数据...');
    const items = await dictService.getDictionaryItems(dictKey, context.data as import('../types').ContextData);
    task.update(100, `已加载 ${items.length} 条数据`);
  });

  // 后台任务：预加载 fetchOptions 数据并写入缓存
  app.onTask('_prefetch_options', async (task, context) => {
    const featureId = context[FIELD_PREFETCH_FEATURE_ID] as string | undefined;
    const inputIndex = (context[FIELD_PREFETCH_INPUT_INDEX] as number | undefined) ?? 0;

    const featuresModule = require('../config/features');
    const features = (featuresModule?.default ?? featuresModule) as import('../types').Feature[];
    const feature = features.find((f) => f.id === featureId);
    const currentInput = feature?.requiredInputs?.[inputIndex];

    if (!currentInput?.fetchOptions || !currentInput.cacheKey) {
      task.update(100, '无需预加载');
      return;
    }

    task.update(10, '正在加载数据...');
    const result = await resolveOptions(currentInput, '', context.data);
    task.update(100, `已加载 ${result.length} 条数据`);
  });

  // 动作：租户泳道登录（耗时，使用后台任务）
  app.onAction('login', async (context, wf) => {
    wf.startTask('login_task', context);
  });

  app.onTask('login_task', async (task, context) => {
    const tenant = context.data['tenant'] as DictItem;
    const swimlane = context.data['swimlane'] as DictItem;
    Logger.info('执行后台任务: login_task', context);

    const proxyDest = `https://${swimlane.value}-sl-management.shangou.test.meituan.com/api/sac/account/createManagerAndRelTenant?u2dhn6k=7c5a6586a4650cdbf81a6858dd3cffad&yodaReady=h5&csecplatform=4&csecversion=4.2.0`;
    task.update(10, '配置sso账号关联...');

    const data = await http.proxy<{ code: number; message?: string }>(
      'POST',
      proxyDest,
      { data: { tenantId: tenant.value }, timeout: 60000 }
    );

    if (data.code === 0) {
      const targetUrl = `https://${swimlane.value}-sl-qnh.shangou.test.meituan.com/api/v1/sso/loginRedirect`;
      task.update(100, `执行跳转 ${tenant.value} - ${swimlane.value}`);
      openUrl(targetUrl);
      sendNotification('登录成功！');
    } else {
      task.update(100, `登录失败: ${data.message ?? '未知错误'}`);
    }
  });

  // 动作：跳转牵牛花 M 端管理
  app.onAction('jump_qnh_management', async (context) => {
    const swimlane = context.data['swimlane'] as DictItem;
    openUrl(`https://${swimlane.value}-sl-management.shangou.test.meituan.com/`);
  });

  // 动作：跳转牵牛花
  app.onAction('jump_qnh', async (context) => {
    const swimlane = context.data['swimlane'] as DictItem;
    openUrl(`https://${swimlane.value}-sl-qnh.shangou.test.meituan.com/`);
  });

  // 动作：复制字典值到剪切板
  app.onAction('copy_to_clipboard', async (context) => {
    const currentSelected = context.data[FIELD_CURRENT_SELECTED] as DictItem;
    const currentDict = context.data[FIELD_CURRENT_DICT] as DictItem;

    // 读取字典配置的 copyValue，决定复制内容
    const dicts = await dictService.getDictionaries();
    const dictConfig = dicts.find((d) => d.key === String(currentDict.key ?? currentDict.name));
    const copyMode = dictConfig?.copyValue ?? 'json';

    let textToCopy: string;
    if (typeof copyMode === 'function') {
      textToCopy = copyMode(currentSelected);
    } else if (copyMode === 'value') {
      textToCopy = currentSelected.value ?? '';
    } else {
      textToCopy = JSON.stringify(currentSelected, null, 2);
    }

    copyToClipboard(textToCopy);
    sendNotification(
      `已复制 ${currentDict.name}:${currentSelected.name} 的完整数据`,
      '复制成功'
    );
  });

  // 动作：强制刷新缓存
  app.onAction('refresh_cache', async (context, wf) => {
    CacheManager.clearAll();
    sendNotification('缓存已清空，下次查询将重新获取数据', '刷新成功');
    wf.triggerAlfred(encodeContext({ state: DEFAULT_STATE, data: context.data }));
  }, { skipContextSave: true });

  // 动作：选择字典条目（记录最近使用，跳转 home）
  app.onAction('select_dict_item', async (context, wf) => {
    const dictKey = context['dictKey'] as string | undefined;
    const dictItemKey = context['dictItemKey'] as string | undefined;
    if (dictKey && dictItemKey) {
      DictRecentManager.markUsed(dictKey, dictItemKey);
    }
    wf.triggerAlfred(encodeContext({ state: DEFAULT_STATE, data: context.data }));
  });

  // 动作：切换字典条目置顶状态（Cmd+Enter 触发）
  app.onAction('toggle_pin_dict_item', async (context, wf) => {
    const dictPinKey = context['dictPinKey'] as string | undefined;
    const dictKey = context['dictKey'] as string | undefined;

    if (!dictPinKey || !dictKey) return;

    DictPinManager.toggle(dictPinKey);
    wf.triggerAlfred(encodeContext({ state: STATE_SELECT_DICT, dictKey, data: context.data }));
  });

  // 动作：删除字典条目（Alt+Enter 触发）
  app.onAction('delete_dict_item', async (context, wf) => {
    const dictItemId = context['dictItemId'] as string | undefined;
    const dictKey = context['dictKey'] as string | undefined;
    const dictItemName = context['dictItemName'] as string | undefined;

    if (!dictItemId || !dictKey) {
      sendNotification('缺少必要参数，无法删除', '删除失败');
      return;
    }

    await http.delete(`${PROXY_BASE_URL}/dictionaries/${dictItemId}`);
    CacheManager.clear(DictService.getCacheKey(dictKey));
    sendNotification(`已删除: ${dictItemName ?? dictItemId}`, '删除成功');
    wf.triggerAlfred(encodeContext({ state: STATE_SELECT_DICT, dictKey, data: context.data }));
  });

  // 动作：固定/取消固定历史记录
  app.onAction('toggle_pin', async (context, wf) => {
    if (context.id) HistoryManager.togglePin(context.id);
    const nextState = context.returnState ?? DEFAULT_STATE;
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  }, { skipContextSave: true });

  // 动作：删除单条历史记录
  app.onAction('delete_history', async (context, wf) => {
    if (context.id) HistoryManager.deleteHistory(context.id);
    const nextState = context.returnState ?? DEFAULT_STATE;
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  }, { skipContextSave: true });

  // 动作：清空所有未固定的历史记录
  app.onAction('clear_history', async (context, wf) => {
    HistoryManager.clearAll();
    sendNotification('未固定的历史记录已清空');
    wf.triggerAlfred(encodeContext({ state: DEFAULT_STATE, data: context.data }));
  });

  // 动作：打开日志文件
  app.onAction('open_log', async () => {
    const logFile = Logger.getLogFilePath();
    execSync(`open "${logFile}"`);
  });

  // 动作：取消后台任务
  app.onAction('cancel_task', async (context, wf) => {
    const jobId = context.jobId;
    if (jobId) {
      TaskManager.updateTask(jobId, { status: 'cancelled', message: '任务已取消' });
      sendNotification('后台任务已取消');
    }
    const nextState = context.returnState ?? DEFAULT_STATE;
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });

  // 动作：清除单条任务记录
  app.onAction('clear_task', async (context, wf) => {
    const jobId = context.jobId;
    if (jobId) {
      const { existsSync, unlinkSync } = await import('fs');
      const file = TaskManager.getJobFile(jobId);
      if (existsSync(file)) unlinkSync(file);
    }
    const nextState = context.returnState ?? STATE_TASK_MANAGE;
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });

  // 动作：清除所有已结束的任务记录
  app.onAction('clear_all_tasks', async (context, wf) => {
    TaskManager.clearTasks(['done', 'error', 'cancelled']);
    sendNotification('已清除所有结束的任务记录');
    const nextState = context.returnState ?? STATE_TASK_MANAGE;
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });

  // ─── 工作区相关动作 ──────────────────────────────────────────────────────────

  // 动作：加载工作区（恢复上下文快照并回到主页）
  app.onAction('load_workspace', async (context, wf) => {
    const workspaceId = context['workspaceId'] as string | undefined;
    if (!workspaceId) return;

    const workspace = WorkspaceManager.markUsed(workspaceId);
    if (!workspace) {
      sendNotification('工作区不存在或已被删除', 'Workflow');
      return;
    }

    sendNotification(`已切换到工作区: ${workspace.name}`, 'Workflow');
    wf.triggerAlfred(encodeContext({ state: DEFAULT_STATE, data: workspace.data }));
  });

  // 动作：保存工作区快照
  app.onAction('save_workspace', async (context, wf) => {
    const workspaceName = context['workspaceName'] as string | undefined;
    const data = context.data ?? {};

    if (!workspaceName?.trim()) {
      sendNotification('工作区名称不能为空', 'Workflow');
      return;
    }

    const workspace = WorkspaceManager.add(workspaceName.trim(), data);
    Logger.info(`保存工作区: ${workspace.name}`, workspace as unknown as object);
    sendNotification(`工作区「${workspace.name}」已保存`, 'Workflow');
    wf.triggerAlfred(encodeContext({ state: STATE_WORKSPACE_MANAGE, data }));
  });

  // 动作：删除工作区
  app.onAction('delete_workspace', async (context, wf) => {
    const workspaceId = context['workspaceId'] as string | undefined;
    if (!workspaceId) return;

    WorkspaceManager.delete(workspaceId);
    sendNotification('工作区已删除', 'Workflow');
    const nextState = (context.returnState as string | undefined) ?? STATE_WORKSPACE_MANAGE;
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });

  // ─── 快捷指令相关动作 ─────────────────────────────────────────────────────────

  // 动作：执行快捷指令（恢复上下文快照，在当前进程内直接调用绑定的 action handler）
  app.onAction('execute_alias', async (context, wf) => {
    const aliasId = context['aliasId'] as string | undefined;
    const aliasAction = context['aliasAction'] as string | undefined;
    const aliasData = context['aliasData'] as Record<string, unknown> | undefined;

    if (!aliasId || !aliasAction || !aliasData) {
      sendNotification('快捷指令信息不完整', 'Workflow');
      return;
    }

    // 标记别名使用（更新统计）
    const alias = AliasManager.markUsed(aliasId);

    Logger.info(`执行别名: ${alias?.alias} → ${aliasAction}`, { data: aliasData });

    // 构造还原的上下文，直接调用 runAction 执行目标动作
    // triggerAlfred 走的是 filter 路径，无法触发 action；必须在当前进程内调用
    const aliasContext = encodeContext({
      action: aliasAction,
      data: aliasData,
    });
    await wf.runAction(aliasContext);
  });

  // 动作：保存快捷指令
  app.onAction('save_alias', async (context, wf) => {
    const aliasName = context['aliasName'] as string | undefined;
    const pendingAction = context['pendingAction'] as string | undefined;
    const aliasTitle = context['aliasTitle'] as string | undefined;
    const aliasSubtitle = context['aliasSubtitle'] as string | undefined;
    const data = context.data ?? {};

    if (!aliasName?.trim()) {
      sendNotification('触发词不能为空', 'Workflow');
      return;
    }

    if (!pendingAction) {
      sendNotification('快捷指令缺少绑定操作，请重新选择功能后创建', 'Workflow');
      return;
    }

    const alias = AliasManager.add(
      aliasName.trim(),
      pendingAction,
      data,
      aliasTitle ?? pendingAction,
      aliasSubtitle
    );

    Logger.info(`保存别名: ${alias.alias} → ${alias.action}`, alias as unknown as object);
    sendNotification(`快捷指令「${alias.alias}」已保存 → ${alias.title}`, 'Workflow');
    wf.triggerAlfred(encodeContext({ state: STATE_ALIAS_MANAGE, data }));
  });

  // 动作：重命名快捷指令触发词
  app.onAction('rename_alias', async (context, wf) => {
    const aliasId = context['aliasId'] as string | undefined;
    const aliasNewName = context['aliasNewName'] as string | undefined;

    if (!aliasId || !aliasNewName?.trim()) {
      sendNotification('参数缺失，无法重命名', 'Workflow');
      return;
    }

    // 若新名与已有其他别名冲突，先删除冲突项
    const conflict = AliasManager.getAll().find((a) => a.alias === aliasNewName.trim() && a.id !== aliasId);
    if (conflict) AliasManager.delete(conflict.id);

    const updated = AliasManager.rename(aliasId, aliasNewName.trim());
    if (updated) {
      sendNotification(`已重命名为「${updated.alias}」`, 'Workflow');
    }
    wf.triggerAlfred(encodeContext({ state: STATE_ALIAS_MANAGE, data: context.data }));
  });

  // 动作：删除快捷指令
  app.onAction('delete_alias', async (context, wf) => {
    const aliasId = context['aliasId'] as string | undefined;
    if (!aliasId) return;

    AliasManager.delete(aliasId);
    sendNotification('快捷指令已删除', 'Workflow');
    const nextState = (context.returnState as string | undefined) ?? STATE_ALIAS_MANAGE;
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });
}

