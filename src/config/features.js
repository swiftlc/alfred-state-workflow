const PluginManager = require("../core/PluginManager");
const { http } = require("../core/HttpClient");
const Logger = require("../core/Logger");
const CacheManager = require("../core/CacheManager");

/**
 * 功能矩阵配置
 *
 * 在这里配置所有的工作流功能。
 * - id: 唯一标识
 * - name: 功能名称（展示在 Alfred 中）
 * - description: 功能描述
 * - requiredKeys: 该功能依赖的字典上下文（例如需要租户和泳道才能执行）
 * - action: 对应的执行动作名称（在 src/handlers/actions.js 中注册）
 * - type: 功能类型，默认为普通功能。如果为 'global_dict_action'，则表示这是一个针对所有已选字典项的全局操作。
 */
const builtInFeatures = [
    {
        id: "tenant_swimlane_login",
        name: "🚀租户泳道登录",
        description: "",
        requiredKeys: ["tenant", "swimlane"],
        action: "login",
    },
    {
        id: "jump_qnh_management",
        name: "🌐 牵牛花M端跳转",
        description: "",
        requiredKeys: ["swimlane"],
        action: "jump_qnh_management",
    },
    {
        id: "jump_qnh",
        name: "🌐 牵牛花跳转",
        description: "",
        requiredKeys: ["swimlane"],
        action: "jump_qnh",
    },
    {
        id: "switch_env",
        name: "切换环境",
        description: "切换当前工作环境",
        requiredKeys: ["swimlane"],
        requiredInputs: [
            {
                key: "ak",
                label: "appkey",
                placeholder: "请输入或选择appkey",
                // 支持动态获取选项列表
                fetchOptions: async (query, contextData) => {
                    // 模拟从接口获取数据
                    const mockData = [
                        {
                            name: "com.sankuai.waimai.app",
                            description: "外卖主App",
                        },
                        {
                            name: "com.sankuai.meituan.app",
                            description: "美团主App",
                        },
                        {
                            name: "com.sankuai.dianping.app",
                            description: "点评主App",
                        },
                    ];
                    return mockData;
                },
            },
            {
                key: "branch",
                label: "分支名",
                placeholder: "请输入要切换的分支名",
            },
        ],
        action: "switch_env",
    },
    {
        id: "inline_action_test",
        name: "测试内联动作",
        description: "这是一个测试内联动作的功能",
        requiredKeys: [],
        action: "inline_action_test_action",
        actionHandler: async (context, wf) => {
            const { sendNotification } = require("../core/utils");
            sendNotification("内联动作执行成功！", "测试成功");
        },
    },
    {
        id: "copy_dict_value",
        name: (data) =>
            `📋 复制 ${data._currentDict.name}: ${data._currentSelected.name}`,
        description: (data) =>
            `将 ${data._currentDict.name} [${data._currentSelected.name}] 复制到剪切板`,
        requiredKeys: [], // 全局字典操作不需要特定的 requiredKeys，它会根据当前已选的字典动态生成
        action: "copy_to_clipboard",
        type: "split_by_dict",
        recordHistory: false, // 不记录到历史中
    },
    {
        id: "modify_dict_desc",
        name: (data) =>
            `📝 修改描述：${data._currentDict.name}: ${data._currentSelected.name}`,
        description: (data) => `当前描述：${data._currentSelected.description}`,
        requiredKeys: [],
        action: "modify_dict_desc",
        type: "split_by_dict",
        recordHistory: false, // 不记录到历史中
        requiredInputs: [
            {
                key: "input1",
                label: "描述",
                placeholder: "请输入要修改的描述内容",
            },
        ],
        actionHandler: async (context, wf) => {
            const Logger = require("../core/Logger");
            Logger.info(`修改描述：${JSON.stringify(context)}`);
            const { sendNotification } = require("../core/utils");
            const { _currentSelected, _currentDict, input1 } = context.data;

            // 注意：如果 dictKey 是中文，axios 会自动进行 urlencode
            const body = {
                categoryKey: _currentDict.key,
                title: _currentSelected.name,
                description: input1.value,
            };
            const response = await http.put(
                "http://127.0.0.1:8083/dictionaries",
                body,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );
            sendNotification("修改成功！", "修改成功");
        },
    },
    {
        id: "view_swimlane_machines",
        name: "🖥️ 泳道机器查看",
        description: "查看当前泳道下的机器状态",
        requiredKeys: ["swimlane"],
        condition: (data) => {
            Logger.info("当前泳道信息", data.swimlane);
            return data.swimlane && data.swimlane.description;
        },
        requiredInputs: [
            {
                key: "machine",
                label: "机器",
                placeholder: "请选择机器",
                disableManualInput: true,
                fetchOptions: async (query, contextData) => {
                    const stack_uuid = contextData.swimlane.description;

                    return CacheManager.get(
                        "swimlane_machines:" + stack_uuid,
                        async () => {
                            try {
                                const proxyDest = `https://dev.sankuai.com/gateway/cargo/api/stack?type=runners_octo_status&stack_uuid=${stack_uuid}`;
                                const response = await http.get(
                                    "http://www.swiftlc.com/api/sso",
                                    {
                                        headers: {
                                            "Content-Type": "application/json",
                                            "x-proxy-dest": proxyDest,
                                        },
                                    },
                                );
                                Logger.info("接口响应", response);

                                if (response && response.data) {
                                    const machines = Object.values(
                                        response.data,
                                    );
                                    // 按照appkey排序
                                    machines.sort((a, b) =>
                                        (a.appkey || "").localeCompare(
                                            b.appkey || "",
                                        ),
                                    );
                                    return machines.map((m) => ({
                                        name: m.appkey,
                                        description: `IP: ${m.ip} | 状态: ${m.status} | 节点: ${m.nodeStatus} ${m.errMsg ? "| 错误: " + m.errMsg : ""}`,
                                        value: m,
                                    }));
                                }
                                return [];
                            } catch (error) {
                                console.error("获取泳道机器列表失败", error);
                                return []; // 降级使用本地数据
                            }
                        },
                        60 * 1000, // 缓存 1 分钟
                    );
                },
            },
        ],
        action: "view_swimlane_machines_action",
        actionHandler: async (context, wf) => {
            const { sendNotification } = require("../core/utils");
            const machine = context.data.machine.value;
            sendNotification(
                `已选择机器: ${machine.appkey}`,
                `IP: ${machine.ip} | 状态: ${machine.status}`,
            );
        },
    },
];

// 合并内置功能和插件功能
module.exports = [...builtInFeatures, ...PluginManager.getFeatures()];
