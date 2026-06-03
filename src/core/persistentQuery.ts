import CacheManager from './CacheManager';
import { encodeContext } from './utils';
import {
  FIELD_SILENT_ON_SUCCESS,
  FIELD_QUERY_CACHE_KEY,
  FIELD_QUERY_PERSIST,
  FIELD_QUERY_REFRESH_ACTION,
  FIELD_QUERY_FORCE_REFRESH,
  FIELD_QUERY_TASK_NAME,
} from '../config/constants';
import type Workflow from './Workflow';
import type { ActionHandler, Context, ContextData } from '../types';

export {
  FIELD_QUERY_CACHE_KEY,
  FIELD_QUERY_PERSIST,
  FIELD_QUERY_REFRESH_ACTION,
  FIELD_QUERY_FORCE_REFRESH,
  FIELD_QUERY_TASK_NAME,
};

/**
 * 持久化缓存查询通用入口。
 *
 * 逻辑：
 * - 无强制刷新 + 缓存命中 → 直接跳转 resultState 展示缓存结果
 * - 强制刷新 → 清除缓存 key，重新起后台任务
 * - 缓存未命中 → 起后台任务，任务结束后静默跳转 resultState
 *
 * 任务侧只需调用 CacheManager.set(cacheKey, data) 不传 TTL 即可实现持久存储。
 * 结果态读取 FIELD_QUERY_TASK_NAME / FIELD_QUERY_REFRESH_ACTION 自动重启查询。
 */
export async function startWithCacheCheck(
  wf: Workflow,
  context: Context,
  opts: {
    taskName: string;
    cacheKey: string;
    resultState: string;
    /** 默认取 context.action（feature 自身 action 名），无需显式传 */
    refreshAction?: string;
  }
): Promise<void> {
  const refreshAction = opts.refreshAction ?? (context.action as string | undefined) ?? '';
  const forceRefresh = !!(context[FIELD_QUERY_FORCE_REFRESH] as boolean | undefined);

  if (!forceRefresh) {
    const cached = await CacheManager.get(opts.cacheKey);
    if (cached !== null) {
      wf.triggerAlfred(encodeContext({
        state: opts.resultState,
        data: context.data,
        [FIELD_QUERY_CACHE_KEY]: opts.cacheKey,
        [FIELD_QUERY_PERSIST]: true,
        [FIELD_QUERY_REFRESH_ACTION]: refreshAction,
        [FIELD_QUERY_TASK_NAME]: opts.taskName,
      }));
      return;
    }
  } else {
    CacheManager.clear(opts.cacheKey);
  }

  wf.startTask(opts.taskName, {
    ...context,
    [FIELD_QUERY_CACHE_KEY]: opts.cacheKey,
    [FIELD_QUERY_PERSIST]: true,
    [FIELD_QUERY_REFRESH_ACTION]: refreshAction,
    [FIELD_QUERY_TASK_NAME]: opts.taskName,
    returnState: opts.resultState,
    [FIELD_SILENT_ON_SUCCESS]: true,
  });
}

/**
 * 为「持久化查询」类 feature 生成标准 actionHandler，减少 features.ts 中的样板代码。
 *
 * 使用方式：
 *   actionHandler: createPersistentQueryHandler({
 *     taskName: 'shepherd_query_task',
 *     cacheKey: (data) => `shepherd:route:${(data['route'] as DictItem)?.value}`,
 *     resultState: STATE_SHEPHERD_RESULT,
 *   })
 *
 * refreshAction 自动取 context.action（即 feature.action），无需传入。
 */
export function createPersistentQueryHandler(opts: {
  taskName: string;
  cacheKey: (data: ContextData) => string;
  resultState: string;
}): ActionHandler {
  return async (context, wf) => {
    const cacheKey = opts.cacheKey(context.data);
    if (!cacheKey) return;
    await startWithCacheCheck(wf, context, {
      taskName: opts.taskName,
      cacheKey,
      resultState: opts.resultState,
    });
  };
}
