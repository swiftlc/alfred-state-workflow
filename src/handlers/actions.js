const { execSync } = require('child_process');

/**
 * 注册所有的执行动作 (Actions)
 * 对应 src/config/features.js 中的 action 字段
 */
module.exports = (app) => {

  // 动作：租户泳道登录
  app.onAction('login', async (context) => {
    const { tenant, swimlane } = context.data;
    const msg = `登录成功！\n租户: ${tenant.name}\n泳道: ${swimlane.name}`;

    // 模拟执行登录逻辑
    execSync(`osascript -e 'display notification "${msg}" with title "Workflow"'`);
  });

  // 动作：跳转泳道控制台
  app.onAction('open_console', async (context) => {
    const { swimlane } = context.data;
    const url = `https://baidu.com`;

    // 模拟打开浏览器
    execSync(`open "${url}"`);
  });

  // 动作：切换环境
  app.onAction('switch_env', async (context) => {
    const { env } = context.data;
    const msg = `已切换到环境: ${env.name}`;

    execSync(`osascript -e 'display notification "${msg}" with title "Workflow"'`);
  });

};

