const {copyToClipboard, sendNotification, openUrl, encodeContext} = require('../core/utils');
const CacheManager = require('../core/CacheManager');
const HistoryManager = require('../core/HistoryManager');
const TaskManager = require('../core/TaskManager');
const {execSync} = require('child_process');
const {http} = require('../core/HttpClient');
const Logger = require('../core/Logger');

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

    const ssoUrl = 'http://www.swiftlc.com/api/sso';

    // 注册后台任务的具体执行逻辑
    app.onTask('login_task', async (task, context) => {
        const {tenant, swimlane} = context.data;
        Logger.info('执行后台任务: login_task', context)

        const proxyDest = `https://${swimlane.value}-sl-management.shangou.test.meituan.com/api/sac/account/createManagerAndRelTenant?u2dhn6k=7c5a6586a4650cdbf81a6858dd3cffad&yodaReady=h5&csecplatform=4&csecversion=4.2.0`;
        task.update(10, `配置sso账号关联...`);
        const data = await http.post(ssoUrl, {tenantId: tenant.value}, {
            headers: {
                'Content-Type': 'application/json',
                'x-proxy-dest': proxyDest
            }
        })

        if (data.code === 0) {
            const targetUrl = `https://${swimlane.value}-sl-qnh.shangou.test.meituan.com/api/v1/sso/loginRedirect`;
            task.update(100, `执行跳转 ${tenant.value} - ${swimlane.value}`);
            await openUrl(targetUrl);
            // 任务完成后，也可以选择发送系统通知
            sendNotification('登录成功！');
        } else {
            task.update(100, `登录失败: ${data.message || '未知错误'}`);
        }
    });

    // 动作：跳转牵牛花管理
    app.onAction('jump_qnh_management', async (context) => {
        const {swimlane} = context.data;

        const url = `https://${swimlane.value}-sl-management.shangou.test.meituan.com/`;

        // 模拟打开浏览器
        openUrl(url);
    });

    // 动作：跳转牵牛花管理
    app.onAction('jump_qnh', async (context) => {
        const {swimlane} = context.data;

        const url = `https://${swimlane.value}-sl-qnh.shangou.test.meituan.com/`;

        // 模拟打开浏览器
        openUrl(url);
    });

    // 动作：切换环境
    app.onAction('switch_env', async (context) => {
        const {swimlane, branch} = context.data;
        let msg = `已切换到环境: ${swimlane.name}`;
        if (branch) {
            msg += `，分支: ${branch.name}`;
        }

        sendNotification(msg, 'Workflow');
    });

    // 动作：复制到剪切板
    app.onAction('copy_to_clipboard', async (context) => {

        const Logger = require('../core/Logger');
        Logger.info('执行动作: copy_to_clipboard', context)
        const {dictKey, data} = context;

        if (dictKey && data && data[dictKey]) {
            const itemData = data[dictKey];
            // 将完整的 JSON 数据格式化后复制到剪切板
            const jsonString = JSON.stringify(itemData, null, 2);
            copyToClipboard(jsonString);
            sendNotification(`已复制 ${dictKey} 的完整数据`, '复制成功');
        } else if (context.copyValue) {
            // 兼容旧的逻辑（如果有的话）
            copyToClipboard(context.copyValue);
            sendNotification(`已复制 ${context.copyName}: ${context.copyValue}`, '复制成功');
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

