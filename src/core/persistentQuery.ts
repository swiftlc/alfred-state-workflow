import CacheManager from './CacheManager';
import { encodeContext } from './utils';
import {
  FIELD_SILENT_ON_SUCCESS,
  FIELD_QUERY_CACHE_KEY,
  FIELD_QUERY_PERSIST,
  FIELD_QUERY_REFRESH_ACTION,
  FIELD_QUERY_FORCE_REFRESH,
} from '../config/constants';
import type Workflow from './Workflow';
import type { Context } from '../types';

export { FIELD_QUERY_CACHE_KEY, FIELD_QUERY_PERSIST, FIELD_QUERY_REFRESH_ACTION, FIELD_QUERY_FORCE_REFRESH };

/**
 * 持久化缓存查询通用入口。
 *
 * 逻辑：
 * - 无强制刷新 + 缓存命中 → 直接跳转 resultState 展示缓存结果
 * - 强制刷新 → 清除缓存 key，重新起后台任务
 * - 缓存未命中 → 起后台任务，任务结束后静默跳转 resultState
 *
 * 任务侧只需调用 CacheManager.set(cacheKey, data) 不传 TTL 即可实现持久存储。
 * 结果态读取 FIELD_QUERY_PERSIST / FIELD_QUERY_REFRESH_ACTION 决定是否展示刷新入口。
 */
export async function startWithCacheCheck(
  wf: Workflow,
  context: Context,
  opts: {
    taskName: string;
    cacheKey: string;
    resultState: string;
    refreshAction: string;
  }
): Promise<void> {
  const forceRefresh = !!(context[FIELD_QUERY_FORCE_REFRESH] as boolean | undefined);

  if (!forceRefresh) {
    const cached = await CacheManager.get(opts.cacheKey);
    if (cached !== null) {
      wf.triggerAlfred(encodeContext({
        state: opts.resultState,
        data: context.data,
        [FIELD_QUERY_CACHE_KEY]: opts.cacheKey,
        [FIELD_QUERY_PERSIST]: true,
        [FIELD_QUERY_REFRESH_ACTION]: opts.refreshAction,
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
    [FIELD_QUERY_REFRESH_ACTION]: opts.refreshAction,
    returnState: opts.resultState,
    [FIELD_SILENT_ON_SUCCESS]: true,
  });
}
