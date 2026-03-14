import {execSync} from 'child_process';
import {copyToClipboard, encodeContext, openUrl, sendNotification} from '../core/utils';
import CacheManager from '../core/CacheManager';
import HistoryManager from '../core/HistoryManager';
import TaskManager from '../core/TaskManager';
import WorkspaceManager from '../core/WorkspaceManager';
import AliasManager from '../core/AliasManager';
import {http} from '../core/HttpClient';
import Logger from '../core/Logger';
import type Workflow from '../core/Workflow';
import type {DictItem} from '../types';

const ssoUrl = 'http://www.swiftlc.com/api/sso';

/**
 * 注册所有执行动作
 * 对应 src/config/features.ts 中的 action 字段
 */
export default function registerActions(app: Workflow): void {
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

    const data = await http.post<{ code: number; message?: string }>(
      ssoUrl,
      { tenantId: tenant.value },
      { headers: { 'Content-Type': 'application/json', 'x-proxy-dest': proxyDest } }
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

  // 动作：切换环境
  app.onAction('switch_env', async (context) => {
    const swimlane = context.data['swimlane'] as DictItem;
    const branch = context.data['branch'] as DictItem | undefined;
    let msg = `已切换到环境: ${swimlane.name}`;
    if (branch) msg += `，分支: ${branch.name}`;
    sendNotification(msg, 'Workflow');
  });

  // 动作：复制字典值到剪切板
  app.onAction('copy_to_clipboard', async (context) => {
    Logger.info('执行动作: copy_to_clipboard', context);
    const currentSelected = context.data['_currentSelected'] as DictItem;
    const currentDict = context.data['_currentDict'] as DictItem;
    copyToClipboard(JSON.stringify(currentSelected, null, 2));
    sendNotification(
      `已复制 ${currentDict.name}:${currentSelected.name} 的完整数据`,
      '复制成功'
    );
  });

  // 动作：强制刷新缓存
  app.onAction('refresh_cache', async (context, wf) => {
    CacheManager.clearAll();
    sendNotification('缓存已清空，下次查询将重新获取数据', '刷新成功');
    wf.triggerAlfred(encodeContext({ state: 'home', data: context.data }));
  });

  // 动作：固定/取消固定历史记录
  app.onAction('toggle_pin', async (context, wf) => {
    if (context.id) HistoryManager.togglePin(context.id);
    const nextState = context.returnState ?? 'home';
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });

  // 动作：删除单条历史记录
  app.onAction('delete_history', async (context, wf) => {
    if (context.id) HistoryManager.deleteHistory(context.id);
    const nextState = context.returnState ?? 'home';
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });

  // 动作：清空所有未固定的历史记录
  app.onAction('clear_history', async (context, wf) => {
    HistoryManager.clearAll();
    sendNotification('未固定的历史记录已清空');
    wf.triggerAlfred(encodeContext({ state: 'home', data: context.data }));
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
    const nextState = context.returnState ?? 'home';
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
    const nextState = context.returnState ?? 'task_manage';
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });

  // 动作：清除所有已结束的任务记录
  app.onAction('clear_all_tasks', async (context, wf) => {
    TaskManager.clearTasks(['done', 'error', 'cancelled']);
    sendNotification('已清除所有结束的任务记录');
    const nextState = context.returnState ?? 'task_manage';
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
    wf.triggerAlfred(encodeContext({ state: 'home', data: workspace.data }));
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
    wf.triggerAlfred(encodeContext({ state: 'workspace_manage', data }));
  });

  // 动作：删除工作区
  app.onAction('delete_workspace', async (context, wf) => {
    const workspaceId = context['workspaceId'] as string | undefined;
    if (!workspaceId) return;

    WorkspaceManager.delete(workspaceId);
    sendNotification('工作区已删除', 'Workflow');
    const nextState = (context.returnState as string | undefined) ?? 'workspace_manage';
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });

  // ─── 智能别名相关动作 ─────────────────────────────────────────────────────────

  // 动作：执行别名（还原上下文并执行对应的 action）
  app.onAction('execute_alias', async (context, wf) => {
    const aliasId = context['aliasId'] as string | undefined;
    const aliasAction = context['aliasAction'] as string | undefined;
    const aliasData = context['aliasData'] as Record<string, unknown> | undefined;

    if (!aliasId || !aliasAction || !aliasData) {
      sendNotification('别名信息不完整', 'Workflow');
      return;
    }

    // 标记别名使用
    AliasManager.markUsed(aliasId);

    // 执行别名关联的 action，并恢复上下文
    Logger.info(`执行别名: ${aliasId}`, { action: aliasAction });
    wf.triggerAlfred(encodeContext({ state: 'home', data: aliasData, _nextAction: aliasAction }));
  });

  // 动作：保存别名
  app.onAction('save_alias', async (context, wf) => {
    const aliasName = context['aliasName'] as string | undefined;
    const data = context.data ?? {};

    if (!aliasName?.trim()) {
      sendNotification('别名名称不能为空', 'Workflow');
      return;
    }

    // 提取当前操作信息（从 data 中获取对应的 action 和 title）
    // 这里假设会从之前保存的操作历史中获取，或者从当前 context 推导
    // 简化方案：使用别名本身作为 title，action 为通用的「回到主页」
    const alias = AliasManager.add(
      aliasName.trim(),
      'rerun',  // 缺省 action，实际应该由操作流程提供
      data,
      `操作序列: ${aliasName.trim()}`,
      '保存的快速别名'
    );

    Logger.info(`保存别名: ${alias.id}`, alias as unknown as object);
    sendNotification(`别名「${aliasName.trim()}」已保存`, 'Workflow');
    wf.triggerAlfred(encodeContext({ state: 'alias_manage', data }));
  });

  // 动作：删除别名
  app.onAction('delete_alias', async (context, wf) => {
    const aliasId = context['aliasId'] as string | undefined;
    if (!aliasId) return;

    AliasManager.delete(aliasId);
    sendNotification('别名已删除', 'Workflow');
    const nextState = (context.returnState as string | undefined) ?? 'alias_manage';
    wf.triggerAlfred(encodeContext({ state: nextState, data: context.data }));
  });
}

