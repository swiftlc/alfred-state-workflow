import {execSync} from 'child_process';
import {copyToClipboard, encodeContext, openUrl, sendNotification} from '../core/utils';
import CacheManager from '../core/CacheManager';
import HistoryManager from '../core/HistoryManager';
import TaskManager from '../core/TaskManager';
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
}

