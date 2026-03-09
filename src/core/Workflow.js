const { encodeContext, decodeContext } = require('./utils');
const { execSync, spawn } = require('child_process');
const path = require('path');
const TaskManager = require('./TaskManager');
const HistoryManager = require('./HistoryManager');
const Logger = require('./Logger');

class Workflow {
  constructor(options = {}) {
    this.bundleId = options.bundleId || process.env.alfred_workflow_bundleid || 'com.example.workflow';
    this.triggerName = options.triggerName || 'flow';
    this.states = {};
    this.actions = {};
    this.tasks = {};
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
    const nextArg = encodeContext({ state: 'progress', jobId });
    const script = `tell application id "com.runningwithcrayons.Alfred" to run trigger "${this.triggerName}" in workflow "${this.bundleId}" with argument "${nextArg}"`;
    execSync(`osascript -e '${script}'`);
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
    const context = decodeContext(arg) || { state: 'home', data: {} };
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
      const nextArg = encodeContext({ state: nextState, ...context });

      // 调用 External Trigger
      const script = `tell application id "com.runningwithcrayons.Alfred" to run trigger "${this.triggerName}" in workflow "${this.bundleId}" with argument "${nextArg}"`;
      execSync(`osascript -e '${script}'`);
      return;
    }

    // 执行自定义动作
    const handler = this.actions[action];
    if (handler) {
      try {
        // 记录历史
        if (context.historyTitle) {
          HistoryManager.addHistory({
            title: context.historyTitle,
            subtitle: context.historySubtitle,
            action: action,
            data: context.data,
            copyValue: context.copyValue,
            copyName: context.copyName
          });
        }

        await handler(context, this);
      } catch (err) {
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

