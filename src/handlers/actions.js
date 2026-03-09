const { copyToClipboard, sendNotification, openUrl } = require('../core/utils');

/**
 * 注册所有的执行动作 (Actions)
 * 对应 src/config/features.js 中的 action 字段
 */
module.exports = (app) => {

  // 动作：租户泳道登录 (耗时操作，使用后台任务)
  app.onAction('login', async (context, wf) => {
    // 启动后台任务，并自动跳转到进度展示界面
    wf.startTask('login_task', context);
  });

  // 注册后台任务的具体执行逻辑
  app.onTask('login_task', async (task, context) => {
    const { tenant, swimlane } = context.data;

    task.update(10, '正在连接租户服务...');
    await new Promise(r => setTimeout(r, 1000)); // 模拟耗时

    task.update(30, `正在验证租户 [${tenant.name}] 权限...`);
    await new Promise(r => setTimeout(r, 1500));

    task.update(60, `正在切换至泳道 [${swimlane.name}]...`);
    await new Promise(r => setTimeout(r, 1500));

    task.update(90, '正在初始化工作区...');
    await new Promise(r => setTimeout(r, 1000));

    task.update(100, `成功登录 ${tenant.name} - ${swimlane.name}`);

    // 任务完成后，也可以选择发送系统通知
    sendNotification('登录成功！');
  });

  // 动作：跳转泳道控制台
  app.onAction('open_console', async (context) => {
    const { swimlane } = context.data;
    const url = `https://baidu.com`;

    // 模拟打开浏览器
    openUrl(url);
  });

  // 动作：切换环境
  app.onAction('switch_env', async (context) => {
    const { env } = context.data;
    const msg = `已切换到环境: ${env.name}`;

    sendNotification(msg, 'Workflow');
  });

  // 动作：复制到剪切板
  app.onAction('copy_to_clipboard', async (context) => {
    const { copyValue, copyName } = context;
    if (copyValue) {
      copyToClipboard(copyValue);
      sendNotification(`已复制 ${copyName}: ${copyValue}`, '复制成功');
    }
  });

};

