const dictService = require('../services/dictService');
const features = require('../config/features');
const TaskManager = require('../core/TaskManager');
const HistoryManager = require('../core/HistoryManager');
const {matchQuery} = require('../core/utils');

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 检查某个功能还缺少哪些字典上下文
 */
function getMissingKeys(feature, data) {
    return feature.requiredKeys.filter(key => !data[key]);
}

module.exports = (app) => {
    /**
     * 状态：任务进度展示 (progress)
     * 使用 Alfred 的 rerun 特性动态刷新进度
     */
    app.onState('progress', async (context, wf) => {
        const {jobId} = context;
        const task = TaskManager.getTask(jobId);

        if (!task) {
            return [wf.createRerunItem('❌ 错误', '找不到任务信息', 'home', {data: context.data})];
        }

        if (task.status === 'running') {
            const spinner = SPINNERS[task.spinnerIdx % SPINNERS.length];
            TaskManager.updateTask(jobId, {spinnerIdx: (task.spinnerIdx || 0) + 1});

            return {
                rerun: 0.2, // 告诉 Alfred 0.2 秒后重新执行此 Script Filter
                items: [
                    {
                        title: `${spinner} ${task.progress}% - ${task.message}`,
                        subtitle: '任务执行中，请稍候... (按回车后台执行，按 Cmd+Enter 取消任务)',
                        arg: wf.createItem('', '', 'rerun', {nextState: 'home', data: context.data}).arg,
                        valid: true, // 允许用户按回车打断并返回主页
                        mods: {
                            cmd: {
                                subtitle: '🛑 取消任务',
                                arg: wf.createItem('', '', 'cancel_task', {jobId, data: context.data}).arg,
                                valid: true
                            }
                        }
                    }
                ]
            };
        } else if (task.status === 'done') {
            return [
                wf.createRerunItem(`✅ ${task.message || '执行完成'}`, '按回车返回主菜单', 'home', {data: context.data})
            ];
        } else {
            return [
                wf.createRerunItem(`❌ 执行失败: ${task.message}`, '按回车返回主菜单', 'home', {data: context.data})
            ];
        }
    });

    /**
     * 状态：主页 (home)
     * 展示当前已选的字典上下文，以及可用的功能矩阵
     */
    app.onState('home', async (context, wf) => {
        const data = context.data || {};
        const query = context.query || '';
        const items = [];

        // 0. 任务中心入口 (如果有任务)
        const tasks = TaskManager.getAllTasks();
        if (tasks.length > 0) {
            const runningCount = tasks.filter(t => t.status === 'running').length;
            const title = runningCount > 0 ? `⏳ 任务中心 (${runningCount}个运行中)` : `📋 任务中心 (${tasks.length}个历史任务)`;
            const subtitle = '查看和管理后台任务';
            if (matchQuery(query, '任务中心', 'task')) {
                items.push(wf.createRerunItem(title, subtitle, 'task_manage', {data}));
            }
        }

        // 1. 历史记录区 (History)
        const history = HistoryManager.getHistory();
        // 主页展示所有固定的历史，以及最多3条未固定的历史
        const pinnedHistory = history.filter(h => h.isPinned);
        const unpinnedHistory = history.filter(h => !h.isPinned).slice(0, 3);
        const displayHistory = [...pinnedHistory, ...unpinnedHistory];

        if (displayHistory.length > 0) {
            for (const record of displayHistory) {
                const icon = record.isPinned ? '📌' : '🕒';
                const title = `${icon} 历史: ${record.title}`;

                // 格式化上下文信息作为副标题
                let contextInfo = '';
                if (record.data && Object.keys(record.data).length > 0) {
                    const parts = [];
                    for (const [key, value] of Object.entries(record.data)) {
                        if (value && value.name) {
                            parts.push(value.name);
                        } else if (typeof value === 'string') {
                            parts.push(value);
                        }
                    }
                    if (parts.length > 0) {
                        contextInfo = `[${parts.join(', ')}]`;
                    }
                }

                const subtitle = contextInfo || '点击重新执行';

                if (matchQuery(query, title, subtitle)) {
                    items.push(wf.createItem(title, subtitle, record.action, {
                        data: record.data,
                        copyValue: record.copyValue,
                        copyName: record.copyName,
                        historyTitle: record.title,
                        historySubtitle: record.subtitle
                    }, {
                        cmd: {
                            subtitle: record.isPinned ? '取消固定' : '固定此记录',
                            action: 'toggle_pin',
                            payload: {id: record.id}
                        }
                    }));
                }
            }

            if (matchQuery(query, '管理历史记录')) {
                items.push(wf.createRerunItem('📚 管理历史记录', `查看全部 ${history.length} 条历史记录`, 'history_manage'));
            }
        }

        // 1. 字典选择区 (Context)
        const dicts = await dictService.getDictionaries();
        for (const dict of dicts) {
            const selected = data[dict.key];
            const title = selected ? `🏷️ [${dict.name}] ${selected.name}` : `📁 [${dict.name}] 未选择`;
            const subtitle = selected ? '点击重新选择' : '点击选择';

            if (matchQuery(query, dict.name, selected?.name)) {
                items.push(wf.createRerunItem(title, subtitle, 'select_dict', {dictKey: dict.key, data}));
            }
        }

        // 2. 功能矩阵区 (Features)
        for (const feature of features) {
            if (feature.type === 'global_dict_action') {
                // 处理全局字典操作类型的 feature
                for (const dict of dicts) {
                    const selected = data[dict.key];
                    if (selected) {
                        const title = `📋 复制 ${dict.name}: ${selected.name}`;
                        const subtitle = ``;

                        if (matchQuery(query, title, subtitle)) {
                            items.push(wf.createItem(title, subtitle, feature.action, {
                                data,
                                copyKey: dict.key,
                                historyTitle: title,
                                historySubtitle: subtitle,
                                recordHistory: feature.recordHistory !== false // 默认支持历史记录
                            }));
                        }
                    }
                }
                continue;
            }

            // 规则：如果该功能不需要任何上下文，或者当前上下文中至少包含一个该功能所需的上下文，则展示
            const hasRelevantContext = feature.requiredKeys.length === 0 || feature.requiredKeys.some(key => data[key]);

            if (!hasRelevantContext) {
                continue; // 上下文完全不匹配时不展示该功能
            }

            if (!matchQuery(query, feature.name, feature.description)) {
                continue;
            }

            const missingKeys = getMissingKeys(feature, data);
            if (missingKeys.length === 0) {
                if (feature.requiredInputs && feature.requiredInputs.length > 0) {
                    // 字典上下文已齐备，但还需要手动输入参数
                    const nextInput = feature.requiredInputs[0];
                    items.push(wf.createRerunItem(`⚙️ 配置: ${feature.name}`, `需要输入: ${nextInput.label} (点击开始配置)`, 'input_state', {
                        data,
                        pendingAction: feature.id,
                        inputIndex: 0
                    }));
                } else {
                    // 满足条件，可直接执行
                    items.push(wf.createItem(` ${feature.name}`, feature.description, feature.action, {
                        data,
                        historyTitle: `执行: ${feature.name}`,
                        historySubtitle: feature.description,
                        recordHistory: feature.recordHistory !== false // 默认支持历史记录
                    }));
                }
            } else {
                // 缺少上下文，引导配置
                const missingNames = dicts.filter(d => missingKeys.includes(d.key)).map(d => d.name).join(', ');
                items.push(wf.createRerunItem(`⚙️ 配置: ${feature.name}`, `缺少上下文: ${missingNames} (点击开始配置)`, 'select_dict', {
                    dictKey: missingKeys[0],
                    data,
                    pendingAction: feature.id
                }));
            }
        }

        // 3. 上下文管理与缓存管理
        if (Object.keys(data).length > 0 && matchQuery(query, '清空上下文')) {
            items.push(wf.createRerunItem('🗑️ 清空上下文', '清除所有已选择的字典数据，重新开始', 'home', {data: {}}));
        }

        if (matchQuery(query, '刷新缓存')) {
            items.push(wf.createItem('🔄 强制刷新缓存', '清除本地字典缓存并重新获取', 'refresh_cache'));
        }

        return items;
    });

    /**
     * 状态：历史记录管理 (history_manage)
     */
    app.onState('history_manage', async (context, wf) => {
        const query = context.query || '';
        const items = [];
        const history = HistoryManager.getHistory();

        for (const record of history) {
            const icon = record.isPinned ? '📌' : '🕒';
            const title = `${icon} ${record.title}`;

            // 格式化上下文信息作为副标题
            let contextInfo = '';
            if (record.data && Object.keys(record.data).length > 0) {
                const parts = [];
                for (const [key, value] of Object.entries(record.data)) {
                    if (value && value.name) {
                        parts.push(value.name);
                    } else if (typeof value === 'string') {
                        parts.push(value);
                    }
                }
                if (parts.length > 0) {
                    contextInfo = `[${parts.join(', ')}] `;
                }
            }

            const subtitle = contextInfo + `[回车]执行 [Cmd]${record.isPinned ? '取消固定' : '固定'} [Alt]删除`;

            if (matchQuery(query, title, record.subtitle)) {
                items.push(wf.createItem(title, subtitle, record.action, {
                    data: record.data,
                    copyValue: record.copyValue,
                    copyName: record.copyName,
                    historyTitle: record.title,
                    historySubtitle: record.subtitle
                }, {
                    cmd: {
                        subtitle: record.isPinned ? '取消固定' : '固定此记录',
                        action: 'toggle_pin',
                        payload: {id: record.id, returnState: 'history_manage'}
                    },
                    alt: {
                        subtitle: '删除此记录',
                        action: 'delete_history',
                        payload: {id: record.id, returnState: 'history_manage'}
                    }
                }));
            }
        }

        if (history.length > 0 && matchQuery(query, '清空历史')) {
            items.push(wf.createItem('🗑️ 清空所有历史记录', '删除所有未固定的历史记录', 'clear_history'));
        }

        items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', {data: context.data}));
        return items;
    });

    /**
     * 状态：任务管理 (task_manage)
     */
    app.onState('task_manage', async (context, wf) => {
        const query = context.query || '';
        const items = [];
        const tasks = TaskManager.getAllTasks();

        if (tasks.length === 0) {
            return [wf.createRerunItem('暂无后台任务', '按回车返回主菜单', 'home', {data: context.data})];
        }

        let hasRunning = false;
        let hasDoneOrError = false;

        for (const task of tasks) {
            let icon = '⏳';
            let subtitle = '';
            let action = 'rerun';
            let payload = {nextState: 'progress', jobId: task.id, data: context.data};
            let mods = {};

            if (task.status === 'running') {
                hasRunning = true;
                const spinner = SPINNERS[(task.spinnerIdx || 0) % SPINNERS.length];
                icon = spinner;
                subtitle = `[运行中] ${task.progress}% - ${task.message} (回车查看进度，Cmd取消)`;
                mods = {
                    cmd: {
                        subtitle: '🛑 取消任务',
                        action: 'cancel_task',
                        payload: {jobId: task.id, returnState: 'task_manage'}
                    }
                };
            } else if (task.status === 'done') {
                hasDoneOrError = true;
                icon = '✅';
                subtitle = `[已完成] ${task.message} (回车清除记录)`;
                action = 'clear_task';
                payload = {jobId: task.id, returnState: 'task_manage'};
            } else if (task.status === 'error') {
                hasDoneOrError = true;
                icon = '❌';
                subtitle = `[失败] ${task.message} (回车清除记录)`;
                action = 'clear_task';
                payload = {jobId: task.id, returnState: 'task_manage'};
            } else if (task.status === 'cancelled') {
                hasDoneOrError = true;
                icon = '🛑';
                subtitle = `[已取消] ${task.message} (回车清除记录)`;
                action = 'clear_task';
                payload = {jobId: task.id, returnState: 'task_manage'};
            }

            const title = `${icon} 任务: ${task.name}`;

            if (matchQuery(query, title, subtitle)) {
                items.push(wf.createItem(title, subtitle, action, payload, mods));
            }
        }

        if (hasDoneOrError && matchQuery(query, '清除已完成任务')) {
            items.push(wf.createItem('🧹 清除所有已结束任务', '清除所有已完成、失败或取消的任务记录', 'clear_all_tasks', {returnState: 'task_manage'}));
        }

        items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', {data: context.data}));

        return hasRunning ? {rerun: 1, items} : items;
    });

    /**
     * 状态：选择字典项 (select_dict)
     * 展示某个字典下的所有选项，供用户选择
     */
    app.onState('select_dict', async (context, wf) => {
        const {dictKey, data = {}, pendingAction} = context;
        const query = context.query || '';
        const items = [];

        let dictItems = await dictService.getDictionaryItems(dictKey);
        const dicts = await dictService.getDictionaries();
        const dictName = dicts.find(d => d.key === dictKey)?.name || dictKey;

        if (query) {
            dictItems = dictItems.filter(item => matchQuery(query, item.name));
            // 增加手动输入结果
            dictItems.unshift({
                id: `manual_${query}`,
                name: query,
                value: query,
                isManual: true
            });
        }

        for (const item of dictItems) {
            const newData = {...data, [dictKey]: item};

            let title = item.isManual ? `✏️ 手动输入: ${item.name}` : `${item.name}`;
            let subtitle = item.isManual ? `将 ${item.name} 设置为当前 ${dictName} (手动输入)` : `${item.value}  ${item.description}`;

            if (pendingAction) {
                const feature = features.find(f => f.id === pendingAction);
                const missingKeys = getMissingKeys(feature, newData);

                if (missingKeys.length > 0) {
                    // 还有缺失的上下文，继续引导
                    const nextDictName = dicts.find(d => d.key === missingKeys[0])?.name || missingKeys[0];
                    subtitle = `继续配置 ${feature.name} (下一步: 选择${nextDictName})`;
                    items.push(wf.createRerunItem(title, subtitle, 'select_dict', {
                        dictKey: missingKeys[0],
                        data: newData,
                        pendingAction
                    }));
                } else if (feature.requiredInputs && feature.requiredInputs.length > 0) {
                    // 字典上下文已齐备，但还需要手动输入参数
                    const nextInput = feature.requiredInputs[0];
                    subtitle = `继续配置 ${feature.name} (下一步: 输入${nextInput.label})`;
                    items.push(wf.createRerunItem(title, subtitle, 'input_state', {
                        data: newData,
                        pendingAction,
                        inputIndex: 0
                    }));
                } else {
                    // 上下文已齐备，直接提供执行选项
                    subtitle = `配置完成，按回车直接执行 [${feature.name}]`;
                    items.push(wf.createItem(title, subtitle, feature.action, {
                        data: newData,
                        historyTitle: `执行: ${feature.name}`,
                        historySubtitle: feature.description,
                        recordHistory: feature.recordHistory !== false // 默认支持历史记录
                    }));
                }
            } else {
                // 普通的选择字典，选完回到主页
                items.push(wf.createRerunItem(title, subtitle, 'home', {data: newData}));
            }
        }

        // 返回上一级
        if (matchQuery(query, '返回')) {
            items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', {data}));
        }

        return items;
    });

    /**
     * 状态：手动输入参数 (input_state)
     */
    app.onState('input_state', async (context, wf) => {
        const {data = {}, pendingAction, inputIndex = 0} = context;
        const query = context.query || '';
        const items = [];

        const feature = features.find(f => f.id === pendingAction);
        if (!feature || !feature.requiredInputs || !feature.requiredInputs[inputIndex]) {
            return [wf.createRerunItem('❌ 错误', '找不到需要输入的配置项', 'home')];
        }

        const currentInput = feature.requiredInputs[inputIndex];
        const isLastInput = inputIndex === feature.requiredInputs.length - 1;

        // 如果配置了 fetchOptions，则动态获取选项列表
        if (currentInput.fetchOptions) {
            try {
                let options = await currentInput.fetchOptions(query, data);

                // 如果有查询词，进行过滤
                if (query) {
                    options = options.filter(opt => matchQuery(query, opt.name, opt.description));
                    // 允许用户手动输入不在列表中的值
                    options.unshift({name: query, description: '手动输入', isManual: true});
                }

                if (options.length === 0) {
                    items.push({
                        title: `未找到匹配的 ${currentInput.label}`,
                        subtitle: '请尝试其他搜索词',
                        valid: false
                    });
                } else {
                    for (const opt of options) {
                        // 如果是手动输入，构造一个基本的对象；如果是接口返回的，直接使用整个对象
                        const optValue = opt.isManual ? {name: opt.name, value: opt.name, isManual: true} : opt;
                        const newData = {...data, [currentInput.key]: optValue};
                        const title = opt.isManual ? `✏️ 手动输入: ${opt.name}` : `选择: ${opt.name}`;
                        const subtitle = opt.description || `设置为 ${currentInput.label}`;

                        if (isLastInput) {
                            items.push(wf.createItem(title, `配置完成，按回车直接执行 [${feature.name}] - ${subtitle}`, feature.action, {
                                data: newData,
                                historyTitle: `执行: ${feature.name}`,
                                historySubtitle: feature.description,
                                recordHistory: feature.recordHistory !== false // 默认支持历史记录
                            }));
                        } else {
                            const nextInput = feature.requiredInputs[inputIndex + 1];
                            items.push(wf.createRerunItem(title, `继续配置 ${feature.name} (下一步: 输入${nextInput.label}) - ${subtitle}`, 'input_state', {
                                data: newData,
                                pendingAction,
                                inputIndex: inputIndex + 1
                            }));
                        }
                    }
                }
            } catch (err) {
                items.push(wf.createItem('❌ 获取选项失败', err.message, 'open_log'));
            }
        } else {
            // 纯手动输入模式
            if (query) {
                const newData = {...data, [currentInput.key]: {name: query, value: query, isManual: true}};

                if (isLastInput) {
                    items.push(wf.createItem(`✅ 确认输入: ${query}`, `配置完成，按回车直接执行 [${feature.name}]`, feature.action, {
                        data: newData,
                        historyTitle: `执行: ${feature.name}`,
                        historySubtitle: feature.description,
                        recordHistory: feature.recordHistory !== false // 默认支持历史记录
                    }));
                } else {
                    const nextInput = feature.requiredInputs[inputIndex + 1];
                    items.push(wf.createRerunItem(`✅ 确认输入: ${query}`, `继续配置 ${feature.name} (下一步: 输入${nextInput.label})`, 'input_state', {
                        data: newData,
                        pendingAction,
                        inputIndex: inputIndex + 1
                    }));
                }
            } else {
                items.push({
                    title: `✏️ 请输入 ${currentInput.label}`,
                    subtitle: currentInput.placeholder || `在搜索框中输入内容后按回车`,
                    valid: false
                });
            }
        }

        items.push(wf.createRerunItem('🔙 返回', '返回主菜单', 'home', {data}));
        return items;
    });
};

