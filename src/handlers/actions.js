const {copyToClipboard, sendNotification, openUrl, encodeContext} = require('../core/utils');
const CacheManager = require('../core/CacheManager');
const HistoryManager = require('../core/HistoryManager');
const TaskManager = require('../core/TaskManager');
const {execSync} = require('child_process');

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
        const {tenant, swimlane} = context.data;

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
        const {swimlane} = context.data;
        const url = `https://baidu.com`;

        // 模拟打开浏览器
        openUrl(url);
    });

    // 动作：切换环境
    app.onAction('switch_env', async (context) => {
        const {env, branch} = context.data;
        let msg = `已切换到环境: ${env.name}`;
        if (branch) {
            msg += `，分支: ${branch}`;
        }

        sendNotification(msg, 'Workflow');
    });

    // 动作：复制到剪切板
    app.onAction('copy_to_clipboard', async (context) => {

        const Logger = require('../core/Logger');
        Logger.info('执行动作: copy_to_clipboard', context)
        const {copyValue, copyName} = context;


        if (copyValue) {
            copyToClipboard(copyValue);
            sendNotification(`已复制 ${copyName}: ${copyValue}`, '复制成功');
        }
    });

    // 动作：强制刷新缓存
    app.onAction('refresh_cache', async (context, wf) => {
        CacheManager.clearAll();
        sendNotification('缓存已清空，下次查询将重新获取数据', '刷新成功');

        // 重新触发 home 状态
        const nextArg = encodeContext({state: 'home', data: context.data});
        wf.triggerAlfred(nextArg);
    });

    // 动作：固定/取消固定历史记录
    app.onAction('toggle_pin', async (context, wf) => {
        if (context.id) {
            HistoryManager.togglePin(context.id);
        }
        const nextState = context.returnState || 'home';
        const nextArg = encodeContext({state: nextState, data: context.data});
        wf.triggerAlfred(nextArg);
    });

    // 动作：删除单条历史记录
    app.onAction('delete_history', async (context, wf) => {
        if (context.id) {
            HistoryManager.deleteHistory(context.id);
        }
        const nextState = context.returnState || 'home';
        const nextArg = encodeContext({state: nextState, data: context.data});
        wf.triggerAlfred(nextArg);
    });

    // 动作：清空所有未固定的历史记录
    app.onAction('clear_history', async (context, wf) => {
        HistoryManager.clearAll();
        sendNotification('未固定的历史记录已清空');

        const nextArg = encodeContext({state: 'home', data: context.data});
        wf.triggerAlfred(nextArg);
    });

    // 动作：打开日志文件
    app.onAction('open_log', async () => {
        const Logger = require('../core/Logger');
        const logFile = Logger.getLogFilePath();
        execSync(`open "${logFile}"`);
    });

    // 动作：取消后台任务
    app.onAction('cancel_task', async (context, wf) => {
        const {jobId, returnState} = context;
        if (jobId) {
            TaskManager.updateTask(jobId, {status: 'cancelled', message: '任务已取消'});
            sendNotification('后台任务已取消');
        }

        const nextState = returnState || 'home';
        const nextArg = encodeContext({state: nextState, data: context.data});
        wf.triggerAlfred(nextArg);
    });

    // 动作：清除单条任务记录
    app.onAction('clear_task', async (context, wf) => {
        const {jobId, returnState} = context;
        if (jobId) {
            const fs = require('fs');
            const file = TaskManager.getJobFile(jobId);
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }

        const nextState = returnState || 'task_manage';
        const nextArg = encodeContext({state: nextState, data: context.data});
        wf.triggerAlfred(nextArg);
    });

    // 动作：清除所有已结束的任务记录
    app.onAction('clear_all_tasks', async (context, wf) => {
        TaskManager.clearTasks(['done', 'error', 'cancelled']);
        sendNotification('已清除所有结束的任务记录');

        const nextState = context.returnState || 'task_manage';
        const nextArg = encodeContext({state: nextState, data: context.data});
        wf.triggerAlfred(nextArg);
    });

};

