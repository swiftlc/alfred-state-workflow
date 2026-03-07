const { encodeContext, decodeContext } = require('./utils');
const { execSync } = require('child_process');

class Workflow {
  constructor(options = {}) {
    this.bundleId = options.bundleId || process.env.alfred_workflow_bundleid || 'com.example.workflow';
    this.triggerName = options.triggerName || 'flow';
    this.states = {};
    this.actions = {};
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
   * 创建一个普通的选项
   */
  createItem(title, subtitle, actionName, payload = {}) {
    return {
      title,
      subtitle,
      arg: encodeContext({ action: actionName, ...payload })
    };
  }

  /**
   * 创建一个触发循环状态机的选项
   */
  createRerunItem(title, subtitle, nextState, payload = {}) {
    return this.createItem(title, subtitle, 'rerun', { nextState, ...payload });
  }

  /**
   * 执行 Script Filter 逻辑
   */
  async runFilter(arg) {
    const context = decodeContext(arg) || { state: 'home', data: {} };
    console.error("filter上下文",context);
    const stateName = context.state || 'home';
    const handler = this.states[stateName];

    if (!handler) {
      console.log(JSON.stringify({
        items: [{ title: 'Error', subtitle: `State '${stateName}' not found` }]
      }));
      return;
    }

    try {
      // 支持异步 handler
      const items = await handler(context, this);
      console.log(JSON.stringify({ items }));
    } catch (err) {
      console.log(JSON.stringify({
        items: [{ title: 'Error', subtitle: err.message }]
      }));
    }
  }

  /**
   * 执行 Run Script 逻辑
   */
  async runAction(arg) {
    const context = decodeContext(arg);
    console.error("上下文",context);
    if (!context || !context.action) {
      console.error('Invalid action context');
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
        await handler(context, this);
      } catch (err) {
        console.error('Action execution failed:', err);
      }
    } else {
      console.error('Unknown action:', action);
    }
  }
}

module.exports = Workflow;

