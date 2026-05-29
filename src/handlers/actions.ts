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
import {dismissSnapshot} from '../services/sensingService';
import {resolveEnvTopicId, MAFKA_BASE_URL, type MafkaMsgItem} from '../services/mafkaService';
import {
  PROXY_BASE_URL,
  DEFAULT_STATE,
  STATE_LOGIN_ENV_SELECT,
  STATE_SENSING_PROGRESS,
  FIELD_SENSING_SELECTED,
  STATE_SELECT_DICT,
  STATE_TASK_MANAGE,
  STATE_WORKSPACE_MANAGE,
  STATE_ALIAS_MANAGE,
  FIELD_CURRENT_SELECTED,
  FIELD_CURRENT_DICT,
  FIELD_PREFETCH_DICT_KEY,
  FIELD_PREFETCH_FEATURE_ID,
  FIELD_PREFETCH_INPUT_INDEX,
  FIELD_MSG_CACHE_KEY,
  FIELD_MSG_DATETIME,
  FIELD_MSG_SWIMLANE,
  FIELD_MSG_BASE_TOPIC_ID,
  FIELD_QUERY_CACHE_KEY,
} from '../config/constants';
import type Workflow from '../core/Workflow';
import type {DictItem} from '../types';

const MANAGEMENT_PATH = '/api/sac/account/createManagerAndRelTenant?u2dhn6k=8e8b49cbae29e8a44478a7d7c7a948e2&yodaReady=h5&csecplatform=4&csecversion=4.1.1';

interface LoginEnvConfig {
  label: string;
  managementUrl: string;
  redirectUrl: string;
}

const LOGIN_ENV_CONFIGS: Record<string, LoginEnvConfig> = {
  test_trunk: {
    label: '测试主干',
    managementUrl: `https://management.shangou.test.meituan.com${MANAGEMENT_PATH}`,
    redirectUrl: 'https://qnh.shangou.test.meituan.com/api/v1/sso/loginRedirect',
  },
  st: {
    label: 'ST',
    managementUrl: `https://management.shangou.st.meituan.com${MANAGEMENT_PATH}`,
    redirectUrl: 'https://qnh.shangou.st.meituan.com/api/v1/sso/loginRedirect',
  },
  prod: {
    label: 'Prod',
    managementUrl: `https://management.vip.sankuai.com${MANAGEMENT_PATH}`,
    redirectUrl: 'https://qnh.meituan.com/api/v1/sso/loginRedirect',
  },
};

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
    const loadingKey = `loading:dict_items_${dictKey}`;
    const errorKey = `error:dict_items_${dictKey}`;
    try {
      const items = await dictService.getDictionaryItems(dictKey, context.data as import('../types').ContextData);
      CacheManager.clear(errorKey);
      task.update(100, `已加载 ${items.length} 条数据`);
    } catch (err) {
      // 写入错误信息，不缓存数据，下次进来继续重试
      CacheManager.set(errorKey, (err as Error).message, 30 * 1000);
    } finally {
      CacheManager.clear(loadingKey);
    }
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

  // 后台任务：查询 kafka 消息列表并写入缓存
  app.onTask('_prefetch_messages', async (task, context) => {
    const baseTopicId = context[FIELD_MSG_BASE_TOPIC_ID] as string | undefined;
    const datetime = context[FIELD_MSG_DATETIME] as string | undefined;
    const swimlaneCode = (context[FIELD_MSG_SWIMLANE] as string | undefined) ?? '';
    const cacheKey = context[FIELD_MSG_CACHE_KEY] as string | undefined;

    if (!baseTopicId || !datetime || !cacheKey) {
      task.update(100, '参数缺失');
      return;
    }

    task.update(10, '正在查询消息...');

    const envTopicId = await resolveEnvTopicId(baseTopicId);
    const encodedDt = encodeURIComponent(datetime);
    const destUrl = `${MAFKA_BASE_URL}/mafka/restful/message/timestamp/query?topicId=${envTopicId}&dateTime=${encodedDt}&limit=100`;

    try {
      const response = await http.proxy<{ code: number; msg: string; data: MafkaMsgItem[] }>(
        'GET', destUrl, { headers: { 'm-appkey': 'fe_mafka-fe' } }
      );

      if (response?.code === 0 && Array.isArray(response.data)) {
        let messages = response.data;
        if (swimlaneCode) {
          messages = messages.filter((m) => m.tag && m.tag.includes(swimlaneCode));
        }
        messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        CacheManager.set(cacheKey, messages, 30 * 1000);
        task.update(100, `已加载 ${messages.length} 条消息`);
      } else {
        CacheManager.set(cacheKey, [], 30 * 1000);
        task.update(100, `查询失败: ${response?.msg ?? '未知错误'}`);
      }
    } catch (err) {
      CacheManager.set(cacheKey, [], 30 * 1000);
      task.update(100, `查询异常: ${(err as Error).message}`);
    }
  });

  // 后台任务：预加载消费者组列表并写入缓存
  app.onTask('_prefetch_consumers', async (task, context) => {
    const topicId = context['_consumerTopicId'] as string | undefined;
    const cacheKey = context['_consumerCacheKey'] as string | undefined;
    if (!topicId || !cacheKey) {
      task.update(100, '参数缺失');
      return;
    }
    task.update(10, '正在加载消费者组...');
    const destUrl = `https://mafka.mws-test.sankuai.com/mafka/restful/consumer/listByTopicId?topicId=${topicId}&pageNum=1&limit=100&type=3&content=&auth=-1`;
    const response = await http.proxy<{ code: number; msg: string; data: Array<{ id: number; name: string; appkey: string; remark: string | null; status: number; environment: string; topicName: string }> }>('GET', destUrl, {
      headers: { 'm-appkey': 'fe_mafka-fe' },
    });
    if (response?.code === 0 && Array.isArray(response.data)) {
      CacheManager.set(cacheKey, response.data, 2 * 60 * 1000); // 缓存 2 分钟
      task.update(100, `已加载 ${response.data.length} 个消费者组`);
    } else {
      task.update(100, '加载失败');
    }
  });

  // 动作：租户泳道登录（耗时，使用后台任务）
  app.onAction('login', async (context, wf) => {
    wf.startTask('login_task', context);
  });

  app.onTask('login_task', async (task, context) => {
    const tenant = context.data['tenant'] as DictItem;
    const swimlane = context.data['swimlane'] as DictItem;
    Logger.info('执行后台任务: login_task', context);

    task.update(10, '登录中...');

    const data = await http.post<{ data: { code: number }; message?: string }>(
      'http://www.swiftlc.com/api/qnh/login',
      { swimlane: swimlane.value, tenantId: Number(tenant.value) },
      { timeout: 60000 }
    );

    if (data.data.code === 0) {
      const targetUrl = `https://${swimlane.value}-sl-qnh.shangou.test.meituan.com/api/v1/sso/loginRedirect`;
      task.update(100, `登录成功 ${tenant.value} - ${swimlane.value}`);
      await openUrl(targetUrl);
    } else {
      throw new Error(data.message ?? '未知错误');
    }
  });

  // 动作：进入 base 环境登录二级菜单
  app.onAction('go_login_env_select', async (context, wf) => {
    wf.triggerAlfred(encodeContext({ state: STATE_LOGIN_ENV_SELECT, data: context.data }));
  });

  // 动作：执行 base 环境登录（耗时，使用后台任务）
  app.onAction('exec_login_env', async (context, wf) => {
    wf.startTask('login_env_task', context);
  });

  app.onTask('login_env_task', async (task, context) => {
    const tenant = context.data['tenant'] as DictItem;
    const envKey = (context.data['_loginEnvKey'] as import('../types').DictItem | undefined)?.value;
    const envConfig = envKey ? LOGIN_ENV_CONFIGS[envKey] : undefined;

    if (!envConfig) {
      throw new Error(`未知登录环境: ${envKey ?? '空'}`);
    }

    Logger.info('执行后台任务: login_env_task', { envKey, tenantId: tenant?.value });
    task.update(10, `登录中（${envConfig.label}）...`);

    const resp = await http.post<{ code: number; message?: string }>(
      PROXY_BASE_URL,
      { tenantId: Number(tenant.value) },
      { headers: { 'x-proxy-dest': envConfig.managementUrl }, timeout: 60000 }
    );

    if (resp.code === 0) {
      task.update(100, `登录成功（${envConfig.label}）- 租户 ${tenant.value}`);
      await openUrl(envConfig.redirectUrl);
    } else {
      throw new Error(resp.message ?? '未知错误');
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

  // 动作：直接复制 context.copyValue 到剪贴板（通用）
  app.onAction('copy_value', async (context) => {
    const value = context.copyValue ?? '';
    const name = context.copyName ?? '内容';
    copyToClipboard(String(value));
    sendNotification(`已复制: ${name}`, '复制成功');
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

  // 动作：打开指定 URL
  app.onAction('open_url', async (context) => {
    const url = context.url as string | undefined;
    if (url) openUrl(url);
  });

  // 动作：Shepherd 懒加载接口引用（serviceName#methodName）并复制到剪贴板
  const SHEPHERD_API_DETAIL_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

  app.onAction('shepherd_copy_ref_action', async (context) => {
    const apiGroupName = context['apiGroupName'] as string | undefined;
    const apiName = context['apiName'] as string | undefined;
    if (!apiGroupName || !apiName) return;

    const cacheKey = `shepherd:api:${apiGroupName}:${apiName}`;
    let interfaceRef = await CacheManager.get<string>(cacheKey);

    if (interfaceRef === null) {
      try {
        const res = await http.proxy<{ code: number; data: { invokerViews?: Array<{ serviceName?: string; methodName?: string }> } }>(
          'GET',
          `https://shepherd.mws-test.sankuai.com/spapi/v1/apis/getApi?group=${encodeURIComponent(apiGroupName)}&api=${encodeURIComponent(apiName)}`,
          { headers: { 'm-appkey': 'fe_mws-shepherd-fe' } }
        );
        const invoker = res?.data?.invokerViews?.[0];
        interfaceRef = (invoker?.serviceName && invoker?.methodName)
          ? `${invoker.serviceName}#${invoker.methodName}`
          : null;
        if (interfaceRef) {
          CacheManager.set(cacheKey, interfaceRef, SHEPHERD_API_DETAIL_TTL);
        }
      } catch (err) {
        Logger.info(`shepherd_copy_ref_action 失败: ${(err as Error).message}`);
        sendNotification('获取接口详情失败', 'Shepherd');
        return;
      }
    }

    if (interfaceRef) {
      copyToClipboard(interfaceRef);
      sendNotification(`已复制: ${interfaceRef}`, 'Shepherd');
    } else {
      sendNotification(`${apiName} 暂无接口引用信息`, 'Shepherd');
    }
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

  // 动作：进入环境嗅探进度页
  app.onAction('go_sensing_progress', async (context, wf) => {
    wf.triggerAlfred(encodeContext({ state: STATE_SENSING_PROGRESS, data: context.data }));
  });

  // 动作：⌘ 切换 sensing 单项选中状态（context.data 已含更新后的 _sensingSelected）
  app.onAction('toggle_sensing_item', async (context, wf) => {
    wf.triggerAlfred(encodeContext({ state: STATE_SENSING_PROGRESS, data: context.data }));
  }, { skipContextSave: true });

  // 动作：将单个 sensing 检测结果注入上下文并留在当前页
  app.onAction('inject_sensing_item', async (context, wf) => {
    wf.triggerAlfred(encodeContext({ state: STATE_SENSING_PROGRESS, data: context.data }));
  }, { skipContextSave: true });

  // 动作：应用环境嗅探检测到的上下文
  app.onAction('apply_sensing', async (context, wf) => {
    await dismissSnapshot('clipboard');
    wf.triggerAlfred(encodeContext({ state: DEFAULT_STATE, data: context.data }));
  });

  // ─── Lion 动态配置查询 ─────────────────────────────────────────────────────────

  const LION_CONFIG_TTL = 2 * 60 * 1000; // 2 分钟

  const lionUrl = (env: 'test' | 'prod', appkey: string) =>
    `https://lion.mws${env === 'prod' ? '' : '-test'}.sankuai.com/mwsapi/v1/env/${env}/appKey/${encodeURIComponent(appkey)}/group/default/defaultConfigInstance/type/key/get`;

  const lionRequestBody = (pageNum: number, pageSize = 500) => ({
    key: '', set: '', swimlane: '', grouptags: '', region: '',
    pageNum, pageSize, orderBy: '-modifyTime', tagIds: [],
    value: '', desc: '', createUser: '', modifyUser: '',
    startCreateTime: '', endCreateTime: '', startModifyTime: '', endModifyTime: '',
    rank: '', usage: null, modifyByVirtualUser: '', bizType: 'normal',
  });

  interface LionRawItem { key: string; name: string; value: string; desc: string; type: string; rank: string }
  interface LionConfigItem { key: string; name: string; desc: string; type: string; rank: string; testValue: string | null; prodValue: string | null }

  const lionFetchAll = async (env: 'test' | 'prod', appkey: string): Promise<LionRawItem[]> => {
    const PAGE_SIZE = 500;
    const proxyHeaders = { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' };
    const url = lionUrl(env, appkey);

    const first = await http.proxy<{ code: number; data: { list: LionRawItem[]; total: number } }>(
      'POST', url, { data: lionRequestBody(1, PAGE_SIZE), headers: proxyHeaders }
    );
    if (first?.code !== 0) return [];

    const { list, total } = first.data;
    if (total <= PAGE_SIZE) return list;

    const pages = Math.ceil(total / PAGE_SIZE);
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        http.proxy<{ code: number; data: { list: LionRawItem[] } }>(
          'POST', url, { data: lionRequestBody(i + 2, PAGE_SIZE), headers: proxyHeaders }
        ).then(r => r?.code === 0 ? r.data.list : []).catch(() => [])
      )
    );
    return [...list, ...rest.flat()];
  };

  app.onTask('lion_config_task', async (task, context) => {
    const appkey =
      (context.data['appkey'] as DictItem | undefined)?.value ??
      (context.data['lion_appkey_input'] as DictItem | undefined)?.value ??
      '';
    const cacheKey = (context[FIELD_QUERY_CACHE_KEY] as string | undefined) ?? `lion:config:${appkey}`;

    if (!appkey) {
      CacheManager.set(cacheKey, [], LION_CONFIG_TTL);
      task.update(100, 'appkey 为空');
      return;
    }

    Logger.info(`lion_config_task appkey=${appkey}`);
    task.update(10, `并发拉取 test + prod 配置...`);

    let testItems: LionRawItem[] = [];
    let prodItems: LionRawItem[] = [];
    try {
      [testItems, prodItems] = await Promise.all([
        lionFetchAll('test', appkey).catch(() => []),
        lionFetchAll('prod', appkey).catch(() => []),
      ]);
    } catch (err) {
      CacheManager.set(cacheKey, [], LION_CONFIG_TTL);
      task.update(100, `拉取失败: ${(err as Error).message}`);
      return;
    }

    task.update(80, '合并配置项...');

    const merged = new Map<string, LionConfigItem>();
    for (const item of testItems) {
      merged.set(item.key, { key: item.key, name: item.name, desc: item.desc, type: item.type, rank: item.rank, testValue: item.value, prodValue: null });
    }
    for (const item of prodItems) {
      const existing = merged.get(item.key);
      if (existing) {
        existing.prodValue = item.value;
      } else {
        merged.set(item.key, { key: item.key, name: item.name, desc: item.desc, type: item.type, rank: item.rank, testValue: null, prodValue: item.value });
      }
    }

    const result = Array.from(merged.values());
    CacheManager.set(cacheKey, result, LION_CONFIG_TTL);
    task.update(100, `共 ${result.length} 个配置项（test: ${testItems.length}, prod: ${prodItems.length}）`);
  });

  // 任务：Shepherd 全量接口搜索（拉取所有分组 → 并发批量拉取各分组接口）
  const SHEPHERD_CONCURRENCY = 5;

  interface ShepherdGroup {
    id: number;
    name: string;
    description: string;
  }

  interface ShepherdApiItem {
    id: number;
    name: string;
    path: string;
    description: string;
    apiGroupId: number;
    apiGroupName: string;
  }

  app.onTask('shepherd_search_task', async (task, context) => {
    const cacheKey = (context[FIELD_QUERY_CACHE_KEY] as string | undefined) ?? 'shepherd:all_apis';
    Logger.info('shepherd_search_task 开始');

    task.update(10, '获取所有分组...');

    let groups: ShepherdGroup[] = [];
    try {
      const groupRes = await http.proxy<{ code: number; data: unknown }>(
        'GET',
        'https://shepherd.mws-test.sankuai.com/spapi/v1/groups/list',
        { headers: { 'm-appkey': 'fe_mws-shepherd-fe' } }
      );
      Logger.info('shepherd groups/list raw', groupRes as unknown as object);
      if (groupRes?.code === 0) {
        const d = groupRes.data as Record<string, unknown>;
        if (Array.isArray(groupRes.data)) {
          groups = groupRes.data as ShepherdGroup[];
        } else if (Array.isArray(d?.list)) {
          groups = d.list as ShepherdGroup[];
        } else if (Array.isArray(d?.groups)) {
          groups = d.groups as ShepherdGroup[];
        } else if (Array.isArray(d?.items)) {
          groups = d.items as ShepherdGroup[];
        }
      }
    } catch (err) {
      CacheManager.set(cacheKey, [], 5 * 60 * 1000);
      task.update(100, `获取分组失败: ${(err as Error).message}`);
      return;
    }

    Logger.info(`shepherd_search_task 共 ${groups.length} 个分组`);
    task.update(20, `共 ${groups.length} 个分组，开始拉取接口...`);

    const allApis: ShepherdApiItem[] = [];
    let finished = 0;
    let firstApiLogged = false;

    for (let i = 0; i < groups.length; i += SHEPHERD_CONCURRENCY) {
      const batch = groups.slice(i, i + SHEPHERD_CONCURRENCY);
      await Promise.all(batch.map(async (group) => {
        try {
          const res = await http.proxy<{ code: number; data: unknown }>(
            'GET',
            `https://shepherd.mws-test.sankuai.com/spapi/v1/apis/${group.id}`,
            { headers: { 'm-appkey': 'fe_mws-shepherd-fe' } }
          );
          if (!firstApiLogged) {
            Logger.info(`shepherd apis/${group.id} raw`, res as unknown as object);
            firstApiLogged = true;
          }
          if (res?.code === 0) {
            const d = res.data as Record<string, unknown>;
            type RawApi = { id: number; name: string; path: string; description: string };
            let apiList: RawApi[] = [];
            if (Array.isArray(res.data)) {
              apiList = res.data as RawApi[];
            } else if (Array.isArray(d?.items)) {
              apiList = d.items as RawApi[];
            } else if (Array.isArray(d?.list)) {
              apiList = d.list as RawApi[];
            } else if (Array.isArray(d?.apis)) {
              apiList = d.apis as RawApi[];
            }
            for (const api of apiList) {
              allApis.push({
                id: api.id,
                name: api.name,
                path: api.path,
                description: api.description,
                apiGroupId: group.id,
                apiGroupName: group.name,
              });
            }
          }
        } catch {
          // 单个分组失败不中断全局
        }
        finished++;
      }));
      const pct = 20 + Math.round((finished / groups.length) * 75);
      task.update(pct, `已处理 ${finished}/${groups.length} 个分组...`);
    }

    CacheManager.set(cacheKey, allApis);  // 无 TTL，持久缓存
    task.update(100, `共缓存 ${allApis.length} 个接口`);
  });

  // 任务：Shepherd 接口信息查询
  app.onTask('shepherd_query_task', async (task, context) => {
    const route = (context.data['route'] as DictItem | undefined)?.value ?? '';
    const cacheKey = (context[FIELD_QUERY_CACHE_KEY] as string | undefined) ?? `shepherd:route:${route}`;
    Logger.info(`shepherd_query_task 开始 route=${route}`);

    interface ShepherdSearchItem {
      apiGroupId: number; apiGroupName: string; apiId: number; apiName: string;
      description: string; requestPath: string; remoteServiceName: string; remoteMethodName: string;
    }
    interface ShepherdResult {
      apiId: number; apiGroupId: number; apiGroupName: string; apiName: string;
      description: string; requestPath: string; serviceName: string; methodName: string; exactMatch: boolean;
    }

    task.update(30, `搜索: ${route}`);

    let rawItems: ShepherdSearchItem[] = [];
    try {
      const res = await http.proxy<{ code: number; data: { items: ShepherdSearchItem[] } }>(
        'GET',
        `https://shepherd.mws-test.sankuai.com/spapi/v1/search/api?conditionType=2&requestPath=${encodeURIComponent(route)}&rangeType=1&cn=1&sn=10&tn=0`,
        { headers: { 'm-appkey': 'fe_mws-shepherd-fe' } }
      );
      if (res?.code === 0 && Array.isArray(res.data?.items)) {
        rawItems = res.data.items;
      }
    } catch (err) {
      CacheManager.set(cacheKey, [], 5 * 60 * 1000);
      task.update(100, `搜索失败: ${(err as Error).message}`);
      return;
    }

    // 精准匹配优先，最多 5 条
    const exact = rawItems.filter(i => i.requestPath === route);
    const fuzzy = rawItems.filter(i => i.requestPath !== route);
    const merged = [...exact, ...fuzzy].slice(0, 5);

    const results: ShepherdResult[] = merged.map(i => ({
      apiId: i.apiId,
      apiGroupId: i.apiGroupId,
      apiGroupName: i.apiGroupName,
      apiName: i.apiName,
      description: i.description,
      requestPath: i.requestPath,
      serviceName: i.remoteServiceName,
      methodName: i.remoteMethodName,
      exactMatch: i.requestPath === route,
    }));

    CacheManager.set(cacheKey, results);  // 无 TTL，持久缓存
    task.update(100, results.length > 0 ? `找到 ${results.length} 个接口` : `未找到匹配接口`);
  });
}

