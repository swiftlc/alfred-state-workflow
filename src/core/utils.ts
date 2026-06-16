import {execSync} from 'child_process';
// @ts-ignore – pinyin-match 暂无官方类型声明
import pinyinMatch from 'pinyin-match';
// @ts-ignore – fuzzysort 暂无 @types 包
import fuzzysort from 'fuzzysort';
import CacheManager from './CacheManager';
import {RERUN_INTERVAL_LOADING} from '../config/constants';
import type {AlfredFilterOutput, AlfredItem, ContextData, DictItem, RequiredInput} from '../types';

export function encodeContext(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

export function decodeContext(str: string): Record<string, unknown> | null {
  if (!str) return null;
  try {
    return JSON.parse(Buffer.from(str, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface MatchQueryOptions {
  /** 是否启用模糊搜索，默认 true */
  fuzzy?: boolean;
}

/**
 * 检查查询字符串是否匹配目标字符串
 * 支持拼音、模糊匹配、空格多条件（AND 逻辑）
 */
export function matchQuery(query: string, ...targets: (string | undefined | null)[]): boolean {
  return matchQueryOpts(query, targets);
}

/**
 * 可配置搜索模式的 matchQuery 变体
 * - fuzzy: false → 仅拼音 + 字符串包含
 * - fuzzy: true（默认）→ 拼音 + 模糊匹配
 */
export function matchQueryOpts(
  query: string,
  targets: (string | undefined | null)[],
  options: MatchQueryOptions = {}
): boolean {
  if (!query) return true;

  const { fuzzy = true } = options;
  const terms = query.split(/\s+/).filter((t) => t.trim() !== '');
  if (terms.length === 0) return true;

  const validTargets = targets.filter((t): t is string => t != null && t !== '');
  if (validTargets.length === 0) return false;

  return terms.every((term) =>
    validTargets.some((target) => {
      if (pinyinMatch.match(target, term)) return true;
      if (!fuzzy) return target.toLowerCase().includes(term.toLowerCase());
      const result = fuzzysort.single(term, target) as { score: number } | null;
      return result !== null && result.score > -10000;
    })
  );
}

/**
 * 复制内容到剪切板
 */
export function copyToClipboard(text: string): void {
  if (!text) return;
  const safeText = text.replace(/(["\\])/g, '\\$1');
  execSync(`echo "${safeText}" | pbcopy`);
}

/**
 * 发送系统通知
 */
export function sendNotification(message: string, title = 'Alfred Workflow'): void {
  if (!message) return;
  const safeMessage = message.replace(/(["\\])/g, '\\$1');
  const safeTitle = title.replace(/(["\\])/g, '\\$1');
  execSync(`osascript -e 'display notification "${safeMessage}" with title "${safeTitle}"'`);
}

/**
 * 在默认浏览器中打开 URL
 */
export function openUrl(url: string): void {
  if (!url) return;
  const safeUrl = url.replace(/(["\\])/g, '\\$1');
  execSync(`open "${safeUrl}"`);
}

/**
 * 统一调用 fetchOptions，自动处理 cacheKey + cacheTtl 的缓存逻辑。
 * feature 只需编写纯粹的 fetch 函数，无需在内部手写 CacheManager 代码。
 */
export async function resolveOptions(
  input: RequiredInput,
  query: string,
  contextData: ContextData
): Promise<DictItem[]> {
  if (!input.fetchOptions) return [];

  const cacheKey = input.cacheKey?.(contextData);
  const ttl = input.cacheTtl ?? 0; // 默认永不过期，用户主动刷新

  if (cacheKey) {
    return (await CacheManager.get<DictItem[]>(
      cacheKey,
      () => input.fetchOptions!(query, contextData),
      ttl
    )) ?? [];
  }

  return input.fetchOptions(query, contextData);
}

export const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/**
 * 构造非阻塞加载状态的 AlfredFilterOutput：spinner + 加载中文字 + rerun
 */
export function makeLoadingOutput(title: string, subtitle: string, iconPath?: string): AlfredFilterOutput {
  const spinner = SPINNERS[Math.floor(Date.now() / 200) % SPINNERS.length]!;
  const item: AlfredItem = { title: `${spinner} ${title}`, subtitle, valid: false };
  if (iconPath) item.icon = { path: iconPath };
  return { rerun: RERUN_INTERVAL_LOADING, items: [item] };
}

/**
 * 防重 spawnWorker 守卫：以 `loading:${cacheKey}` 为标志，
 * 确保同一缓存 key 同时只发起一次后台 worker。
 */
export async function spawnIfNotLoading(cacheKey: string, spawn: () => void): Promise<void> {
  const loadingKey = `loading:${cacheKey}`;
  if (!(await CacheManager.get(loadingKey))) {
    await CacheManager.set(loadingKey, true, 60 * 1000);
    spawn();
  }
}

