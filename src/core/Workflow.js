const { encodeContext, decodeContext } = require('./utils');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const TaskManager = require('./TaskManager');
const HistoryManager = require('./HistoryManager');
const Logger = require('./Logger');

const CONTEXT_FILE = path.join(__dirname, '../../data/context.json');

class Workflow {
  constructor(options = {}) {
    this.bundleId = options.bundleId || process.env.alfred_workflow_bundleid || 'com.example.workflow';
    this.triggerName = options.triggerName || 'flow';
    this.states = {};
    this.actions = {};
    this.tasks = {};
    this.ensureContextFileExists();
  }

  /**
   * 触发 Alfred 的 External Trigger
   * @param {string} arg 传递给 Alfred 的参数
   */
  triggerAlfred(arg) {
    const script = `tell application id "com.runningwithcrayons.Alfred" to run trigger "${this.triggerName}" in workflow "${this.bundleId}" with argument "${arg}"`;
    try {
      execSync(`osascript -e '${script}'`);
    } catch (e) {
      Logger.error('Failed to trigger Alfred', e);
    }
  }

  ensureContextFileExists() {
    const dir = path.dirname(CONTEXT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CONTEXT_FILE)) {
      fs.writeFileSync(CONTEXT_FILE, JSON.stringify({ state: 'home', data: {} }), 'utf8');
    }
  }

  saveContext(context) {
    try {
      // 不保存 query，只保存状态和数据
      const contextToSave = {
        state: context.state || 'home',
        data: context.data || {},
        pendingAction: context.pendingAction,
        inputIndex: context.inputIndex,
        jobId: context.jobId,
        timestamp: Date.now()
      };
      fs.writeFileSync(CONTEXT_FILE, JSON.stringify(contextToSave, null, 2), 'utf8');
    } catch (e) {
      Logger.error('Failed to save context', e);
    }
  }

  loadContext() {
    try {
      const data = fs.readFileSync(CONTEXT_FILE, 'utf8');
      const context = JSON.parse(data);

      // 如果上下文保存时间超过 1 分钟 (60000 毫秒)，则清空数据
      if (context.timestamp && (Date.now() - context.timestamp > 60000)) {
        return { state: 'home', data: {} };
      }

      return context;
    } catch (e) {
      return { state: 'home', data: {} };
    }
  }

  /**
   * 注册一个状态（用于 Script Filter）
   * @param {string} stateName 状态名称
   * @param {Function} handler 处理函数，返回 items 数组
   */
  onState(stateName, handler) {
    this.states[stateName] = handler;
  }

  /**
   * 注册一个动作（用于 Run Script）
   * @param {string} actionName 动作名称
   * @param {Function} handler 处理函数
   */
  onAction(actionName, handler) {
    this.actions[actionName] = handler;
  }

  /**
   * 注册一个后台任务
   * @param {string} taskName 任务名称
   * @param {Function} handler 处理函数
   */
  onTask(taskName, handler) {
    this.tasks[taskName] = handler;
  }

  /**
   * 启动一个后台任务并跳转到进度展示状态
   */
  startTask(taskName, context) {
    this._stateChanged = true;
    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    TaskManager.initTask(jobId, taskName);

    // 启动独立的后台进程执行任务
    const workerPath = path.join(__dirname, '../worker.js');
    const contextStr = encodeContext(context);

    const child = spawn(process.execPath, [workerPath, taskName, jobId, contextStr], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    // 触发 Alfred 重新打开 Script Filter 并进入 progress 状态
    const nextArg = encodeContext({ state: 'progress', jobId, data: context.data });
    this.triggerAlfred(nextArg);
  }

  /**
   * 创建一个普通的选项
   */
  createItem(title, subtitle, actionName, payload = {}, mods = {}) {
    const item = {
      title,
      subtitle,
      arg: encodeContext({ action: actionName, ...payload })
    };

    if (Object.keys(mods).length > 0) {
      item.mods = {};
      for (const [key, mod] of Object.entries(mods)) {
        item.mods[key] = {
          subtitle: mod.subtitle,
          arg: encodeContext({ action: mod.action, ...mod.payload })
        };
      }
    }

    return item;
  }

  /**
   * 创建一个触发循环状态机的选项
   */
  createRerunItem(title, subtitle, nextState, payload = {}, mods = {}) {
    return this.createItem(title, subtitle, 'rerun', { nextState, ...payload }, mods);
  }

  /**
   * 执行 Script Filter 逻辑
   */
  async runFilter(arg, query = '') {
    // 如果没有传入 arg，说明是用户刚打开 Alfred，此时加载上次保存的上下文
    let context;
    if (!arg) {
      context = this.loadContext();
    } else {
      context = decodeContext(arg) || { state: 'home', data: {} };
      // 每次状态流转时保存上下文
      this.saveContext(context);
    }

    context.query = query.trim();

    const stateName = context.state || 'home';
    const handler = this.states[stateName];

    if (!handler) {
      Logger.error(`State not found: ${stateName}`, null, { context });
      console.log(JSON.stringify({
        items: [{ title: 'Error', subtitle: `State '${stateName}' not found` }]
      }));
      return;
    }

    try {
      // 支持异步 handler
      const result = await handler(context, this);
      if (Array.isArray(result)) {
        console.log(JSON.stringify({ items: result }));
      } else if (result && result.items) {
        // 支持返回 { items: [...], rerun: 0.2 } 这种格式
        console.log(JSON.stringify(result));
      } else {
        console.log(JSON.stringify({ items: [] }));
      }
    } catch (err) {
      Logger.error(`Filter execution failed in state: ${stateName}`, err, { context });
      console.log(JSON.stringify({
        items: [
          this.createItem('⚠️ 发生错误', err.message, 'open_log', { error: err.message })
        ]
      }));
    }
  }

  /**
   * 执行 Run Script 逻辑
   */
  async runAction(arg) {
    const context = decodeContext(arg);

    if (!context || !context.action) {
      Logger.error('Invalid action context', null, { arg });
      process.exit(1);
    }

    const { action } = context;

    // 内置的 rerun 动作，用于触发循环状态机
    if (action === 'rerun') {
      const nextState = context.nextState || 'home';
      const nextContext = { state: nextState, ...context };

      // 保存即将跳转的上下文
      this.saveContext(nextContext);

      const nextArg = encodeContext(nextContext);

      // 调用 External Trigger
      this.triggerAlfred(nextArg);
      return;
    }

    // 执行自定义动作
    const handler = this.actions[action];
    if (handler) {
      try {
        // 记录历史 (如果 context.recordHistory 不为 false)
        if (context.historyTitle && context.recordHistory !== false) {
          HistoryManager.addHistory({
            title: context.historyTitle,
            subtitle: context.historySubtitle,
            action: action,
            data: context.data,
            copyValue: context.copyValue,
            copyName: context.copyName,
            copyKey: context.copyKey
          });
        }

        await handler(context, this);

        // 动作执行完成后，如果不是跳转状态，通常意味着流程结束，重置状态到 home，但保留已选的数据上下文
        if (!this._stateChanged && action !== 'toggle_pin' && action !== 'delete_history' && action !== 'refresh_cache') {
           this.saveContext({ state: 'home', data: context.data || {} });
        }
      } 
      catch (err) {
        Logger.error(`Action execution failed: ${action}`, err, { context });
        const { sendNotification } = require('./utils');
        sendNotification(`执行失败: ${err.message}`, 'Workflow Error');
      }
    } else {
      Logger.error(`Unknown action: ${action}`, null, { context });
    }
  }
}

module.exports = Workflow;

