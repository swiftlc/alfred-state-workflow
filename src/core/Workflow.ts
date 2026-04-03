import {execSync, spawn} from 'child_process';
import path from 'path';
import fs from 'fs';
import {decodeContext, encodeContext} from './utils';
import TaskManager from './TaskManager';
import HistoryManager from './HistoryManager';
import Logger from './Logger';
import type {ActionHandler, AlfredFilterOutput, AlfredItem, Context, StateHandler, TaskHandler,} from '../types';

const CONTEXT_FILE = path.join(__dirname, '../../data/context.json');

interface WorkflowOptions {
  bundleId?: string;
  triggerName?: string;
}

/** item.mods 中每个修饰键的描述（在 createItem 中构造时使用） */
interface ModDef {
  subtitle?: string;
  action: string;
  payload?: Record<string, unknown>;
}

class Workflow {
  bundleId: string;
  triggerName: string;
  states: Record<string, StateHandler>;
  actions: Record<string, ActionHandler>;
  tasks: Record<string, TaskHandler>;
  /** 标记当前 action 是否已触发状态跳转，防止 runAction 末尾重复 saveContext */
  _stateChanged: boolean;

  constructor(options: WorkflowOptions = {}) {
    this.bundleId =
      options.bundleId ??
      process.env['alfred_workflow_bundleid'] ??
      'com.example.workflow';
    this.triggerName = options.triggerName ?? 'flow';
    this.states = {};
    this.actions = {};
    this.tasks = {};
    this._stateChanged = false;
    this.ensureContextFileExists();
  }

  // ─── Alfred 触发 ─────────────────────────────────────────────────────────────

  triggerAlfred(arg: string): void {
    const script = `tell application id "com.runningwithcrayons.Alfred" to run trigger "${this.triggerName}" in workflow "${this.bundleId}" with argument "${arg}"`;
    try {
      execSync(`osascript -e '${script}'`);
    } catch (e) {
      Logger.error('Failed to trigger Alfred', e as Error);
    }
  }

  // ─── 上下文持久化 ─────────────────────────────────────────────────────────────

  private ensureContextFileExists(): void {
    const dir = path.dirname(CONTEXT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CONTEXT_FILE)) {
      fs.writeFileSync(
        CONTEXT_FILE,
        JSON.stringify({ state: 'home', data: {} }),
        'utf8'
      );
    }
  }

  saveContext(context: Partial<Context>): void {
    try {
      const contextToSave: Partial<Context> & { timestamp: number } = {
        state: context.state ?? 'home',
        data: context.data ?? {},
        pendingAction: context.pendingAction,
        inputIndex: context.inputIndex,
        jobId: context.jobId,
        timestamp: Date.now(),
      };
      fs.writeFileSync(CONTEXT_FILE, JSON.stringify(contextToSave, null, 2), 'utf8');
    } catch (e) {
      Logger.error('Failed to save context', e as Error);
    }
  }

  /** 上下文最长保留时间：10 分钟 */
  private static readonly CONTEXT_TTL_MS = 10 * 60 * 1000;

  loadContext(): Context {
    try {
      const raw = fs.readFileSync(CONTEXT_FILE, 'utf8');
      const context = JSON.parse(raw) as Context & { timestamp?: number };

      // 上下文保存时间超过 TTL 则重置
      if (context.timestamp && Date.now() - context.timestamp > Workflow.CONTEXT_TTL_MS) {
        return { state: 'home', data: {} };
      }
      return context;
    } catch {
      return { state: 'home', data: {} };
    }
  }

  // ─── 注册 ─────────────────────────────────────────────────────────────────────

  onState(stateName: string, handler: StateHandler): void {
    this.states[stateName] = handler;
  }

  onAction(actionName: string, handler: ActionHandler): void {
    this.actions[actionName] = handler;
  }

  onTask(taskName: string, handler: TaskHandler): void {
    this.tasks[taskName] = handler;
  }

  // ─── 后台任务 ─────────────────────────────────────────────────────────────────

  startTask(taskName: string, context: Context): void {
    this._stateChanged = true;
    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    TaskManager.initTask(jobId, taskName);

    const workerPath = path.join(__dirname, '../worker.ts');
    const contextStr = encodeContext(context);

    // 使用 tsx 启动后台 worker 进程
    const tsxBin = path.join(__dirname, '../../node_modules/.bin/tsx');
    const child = spawn(tsxBin, [workerPath, taskName, jobId, contextStr], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    const nextArg = encodeContext({
      state: 'progress',
      jobId,
      data: context.data,
      returnState: context.returnState,
      pendingAction: context.pendingAction,
      inputIndex: context.inputIndex,
      _silentOnSuccess: context['_silentOnSuccess'],
    });
    this.triggerAlfred(nextArg);
  }

  /**
   * 静默启动后台 worker，不跳转 progress 状态，不记录任务。
   * 用于预加载数据（如 fetchOptions 缓存预热），结果写入 CacheManager 供 filter 轮询读取。
   */
  spawnWorker(taskName: string, context: Context): void {
    const jobId = `prefetch_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const workerPath = path.join(__dirname, '../worker.ts');
    const contextStr = encodeContext({ ...context, _prefetchJobId: jobId });
    const tsxBin = path.join(__dirname, '../../node_modules/.bin/tsx');
    const child = spawn(tsxBin, [workerPath, taskName, jobId, contextStr], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }

  // ─── Item 构造器 ──────────────────────────────────────────────────────────────

  createItem(
    title: string,
    subtitle: string,
    actionName: string,
    payload: Record<string, unknown> = {},
    mods: Record<string, ModDef> = {},
    iconPath?: string
  ): AlfredItem {
    const item: AlfredItem = {
      title,
      subtitle,
      arg: encodeContext({ action: actionName, ...payload }),
    };

    if (iconPath) {
      item.icon = { path: iconPath };
    }

    if (Object.keys(mods).length > 0) {
      item.mods = {};
      for (const [key, mod] of Object.entries(mods)) {
        (item.mods as Record<string, { subtitle?: string; arg: string }>)[key] = {
          subtitle: mod.subtitle,
          arg: encodeContext({ action: mod.action, ...mod.payload }),
        };
      }
    }

    return item;
  }

  createRerunItem(
    title: string,
    subtitle: string,
    nextState: string,
    payload: Record<string, unknown> = {},
    mods: Record<string, ModDef> = {},
    iconPath?: string
  ): AlfredItem {
    return this.createItem(title, subtitle, 'rerun', { nextState, ...payload }, mods, iconPath);
  }

  // ─── 运行入口 ─────────────────────────────────────────────────────────────────

  async runFilter(arg: string, query = ''): Promise<void> {
    let context: Context;
    if (!arg) {
      context = this.loadContext();
      // 每次打开 Alfred（无参数入口）都刷新 timestamp，重新计时
      this.saveContext(context);
    } else {
      context = (decodeContext(arg) as Context | null) ?? { state: 'home', data: {} };
      this.saveContext(context);
    }

    context.query = query.trim();
    const stateName = context.state ?? 'home';
    const handler = this.states[stateName];

    if (!handler) {
      Logger.error(`State not found: ${stateName}`, null, { context });
      console.log(
        JSON.stringify({ items: [{ title: 'Error', subtitle: `State '${stateName}' not found` }] })
      );
      return;
    }

    try {
      const result = await handler(context, this);
      if (Array.isArray(result)) {
        console.log(JSON.stringify({ items: result }));
      } else if (result && (result as AlfredFilterOutput).items) {
        console.log(JSON.stringify(result));
      } else {
        console.log(JSON.stringify({ items: [] }));
      }
    } catch (err) {
      Logger.error(`Filter execution failed in state: ${stateName}`, err as Error, { context });
      console.log(
        JSON.stringify({
          items: [
            this.createItem('⚠️ 发生错误', (err as Error).message, 'open_log', {
              error: (err as Error).message,
            }),
          ],
        })
      );
    }
  }

  async runAction(arg: string): Promise<void> {
    const context = decodeContext(arg) as Context | null;

    if (!context || !context.action) {
      Logger.error('Invalid action context', null, { arg });
      process.exit(1);
    }

    const { action } = context;

    // 内置 rerun 动作
    if (action === 'rerun') {
      const nextState = context.nextState ?? 'home';
      const nextContext: Context = { ...context, state: nextState };
      this.saveContext(nextContext);
      this.triggerAlfred(encodeContext(nextContext));
      return;
    }

    // 查找 handler：先查已注册的 actions，再查 features 内联的 actionHandler
    let handler: ActionHandler | undefined = this.actions[action];

    if (!handler) {
      // 动态导入避免循环依赖
      const featuresModule = require('../config/features');
      const features = (featuresModule?.default ?? featuresModule) as import('../types').Feature[];
      const feature = features.find((f) => f.action === action);
      if (feature && typeof feature.actionHandler === 'function') {
        handler = feature.actionHandler;
      }
    }

    if (handler) {
      try {
        if (context.historyTitle && context.recordHistory !== false) {
          HistoryManager.addHistory({
            title: context.historyTitle,
            subtitle: context.historySubtitle,
            action,
            data: context.data,
            copyValue: context.copyValue,
            copyName: context.copyName,
            copyKey: context.copyKey,
          });
        }

        await handler(context, this);

        if (
          !this._stateChanged &&
          action !== 'toggle_pin' &&
          action !== 'delete_history' &&
          action !== 'refresh_cache'
        ) {
          // 将 action 携带的 data 与持久化上下文的 data 合并，action data 优先覆盖
          const persisted = this.loadContext();
          const mergedData = { ...persisted.data, ...(context.data ?? {}) };
          this.saveContext({ state: 'home', data: mergedData });
        }
      } catch (err) {
        Logger.error(`Action execution failed: ${action}`, err as Error, { context });
        const { sendNotification } = require('./utils') as typeof import('./utils');
        sendNotification(`执行失败: ${(err as Error).message}`, 'Workflow Error');
      }
    } else {
      Logger.error(`Unknown action: ${action}`, null, { context });
    }
  }
}

export default Workflow;

