import {http} from '../core/HttpClient';
import {PROXY_BASE_URL, SENSING_FRESH_MS} from '../config/constants';
import type {DictItem} from '../types';

export interface SensingContext {
  key: string;
  value: { name: string; value: string | Record<string, unknown> };
  confidence: number;
}

export interface SensingSnapshot {
  id: string;
  overallStatus: string;
  contentPreview?: string;
  finalResult: {
    contexts: SensingContext[];
    suggestions: string[];
  } | null;
  finalConfidence: number;
  dismissed: boolean;
  createdAt: number;
}

/** 展开后的单个上下文字段（e_biz 对象类型展开为多个平铺字段） */
export interface FlatSensingContext {
  key: string;
  label: string;
  name: string;
  value: string;
  confidence: number;
}

/** 上下文 key 对应的字典名称 */
const KEY_LABELS: Record<string, string> = {
  tenant: '租户',
  swimlane: '泳道',
  appkey: 'Appkey',
  route: '接口路由',
  traceId: 'TraceId',
  storeId: '门店ID',
  poiId: '门店ID',
  spuId: 'SPU',
  skuId: 'SKU',
  price: '价格',
};

export function getKeyLabel(key: string): string {
  return KEY_LABELS[key] ?? key;
}

export function contextToDictItem(ctx: SensingContext): DictItem {
  const rawValue = ctx.value.value;
  const strValue = typeof rawValue === 'string'
    ? rawValue
    : JSON.stringify(rawValue);
  return { name: ctx.value.name, value: strValue };
}

/**
 * 将 SensingContext 列表展开为平铺字段列表
 * e_biz 等对象类型字段展开为多个独立 key-value 条目
 */
export function expandContexts(contexts: SensingContext[]): FlatSensingContext[] {
  const result: FlatSensingContext[] = [];
  for (const ctx of contexts) {
    if (typeof ctx.value.value === 'string') {
      result.push({
        key: ctx.key,
        label: getKeyLabel(ctx.key),
        name: ctx.value.name,
        value: ctx.value.value,
        confidence: ctx.confidence,
      });
    } else if (ctx.value.value && typeof ctx.value.value === 'object') {
      for (const [subKey, subVal] of Object.entries(ctx.value.value)) {
        result.push({
          key: subKey,
          label: subKey,
          name: String(subVal),
          value: String(subVal),
          confidence: ctx.confidence,
        });
      }
    }
  }
  return result;
}

/** 获取最新一条已完成且有上下文的 sensing 快照 */
export async function getLatestSnapshot(source = 'clipboard'): Promise<SensingSnapshot | null> {
  try {
    const list = await http.get<SensingSnapshot[]>(`${PROXY_BASE_URL}/api/sensing/history/${source}`);
    if (!Array.isArray(list)) return null;
    return list.find(
      (s) => s.overallStatus === 'done' && !s.dismissed && (s.finalResult?.contexts?.length ?? 0) > 0
    ) ?? null;
  } catch {
    return null;
  }
}

/** 获取最新一条 sensing 快照（无论是否完成），已 dismiss 的跳过
 *  优先级：正在解析中 > 解析完成且有结果；跳过完成但无结果的快照
 */
export async function getLatestSnapshotAny(source = 'clipboard'): Promise<SensingSnapshot | null> {
  try {
    const list = await http.get<SensingSnapshot[]>(`${PROXY_BASE_URL}/api/sensing/history/${source}?limit=1`);
    if (!Array.isArray(list)) return null;
    const active = list.filter((s) => !s.dismissed);
    const inProgress = active.find((s) => s.overallStatus !== 'done');
    if (inProgress) return inProgress;
    return active.find((s) => s.overallStatus === 'done' && (s.finalResult?.contexts?.length ?? 0) > 0) ?? null;
  } catch {
    return null;
  }
}

/**
 * 聚合有效期内所有 done 快照的上下文（并集，同 key 以较新快照的值覆盖）
 * 对应"多层叠加"机制：每层快照在有效期内贡献自己的检测结果
 */
export async function getAggregatedContexts(source = 'clipboard', freshMs = SENSING_FRESH_MS): Promise<SensingContext[]> {
  try {
    const list = await http.get<SensingSnapshot[]>(`${PROXY_BASE_URL}/api/sensing/history/${source}?limit=20`);
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    // 有效期内的 done 快照，按创建时间升序（后者覆盖前者同 key 的值）
    const valid = list
      .filter((s) => !s.dismissed && s.overallStatus === 'done' && (s.finalResult?.contexts?.length ?? 0) > 0)
      .filter((s) => now - s.createdAt <= freshMs)
      .sort((a, b) => a.createdAt - b.createdAt);
    // 叠加合并
    const merged = new Map<string, SensingContext>();
    for (const snap of valid) {
      for (const ctx of snap.finalResult!.contexts!) {
        merged.set(ctx.key, ctx);
      }
    }
    return Array.from(merged.values());
  } catch {
    return [];
  }
}

/** 调用 dismiss 接口，使该 source 最近快照不再出现 */
export async function dismissSnapshot(source = 'clipboard'): Promise<void> {
  await http.post(`${PROXY_BASE_URL}/api/sensing/dismiss/${source}`).catch(() => {});
}
