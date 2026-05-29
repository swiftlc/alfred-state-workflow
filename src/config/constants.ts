/** 本地代理服务地址 */
export const PROXY_BASE_URL = 'http://127.0.0.1:8080';

// ─── 状态名称 ─────────────────────────────────────────────────────────────────

/** 默认/回退 state 名称 */
export const DEFAULT_STATE = 'home';

export const STATE_HOME = 'home';
export const STATE_PROGRESS = 'progress';
export const STATE_MANAGE = 'manage';
export const STATE_SELECT_DICT = 'select_dict';
export const STATE_INPUT = 'input_state';
export const STATE_SPLIT_FEATURE = 'split_feature';
export const STATE_HISTORY_MANAGE = 'history_manage';
export const STATE_TASK_MANAGE = 'task_manage';
export const STATE_WORKSPACE_MANAGE = 'workspace_manage';
export const STATE_WORKSPACE_SAVE = 'workspace_save';
export const STATE_ALIAS_MANAGE = 'alias_manage';
export const STATE_ALIAS_SAVE = 'alias_save';
export const STATE_ALIAS_RENAME = 'alias_rename';
export const STATE_KAFKA_OPS = 'kafka_ops';
export const STATE_KAFKA_CONSUMERS = 'kafka_consumers';
export const STATE_KAFKA_MESSAGES = 'kafka_messages';

// ─── rerun 刷新间隔（秒） ─────────────────────────────────────────────────────────

/** 任务运行中进度轮询间隔 */
export const RERUN_INTERVAL_PROGRESS = 0.2;
/** 字典/选项加载中轮询间隔 */
export const RERUN_INTERVAL_LOADING = 0.3;
/** 任务完成后展示结果期间的轮询间隔 */
export const RERUN_INTERVAL_COMPLETED = 0.5;
/** 任务管理页运行中刷新间隔 */
export const RERUN_INTERVAL_TASK_LIST = 1;

// ─── 内部上下文字段名 ─────────────────────────────────────────────────────────────
// 以下字段名在 context.data 中作为框架内部临时字段使用，以 _ 开头与业务字段区分

/** split_by_dict 时当前正在处理的字典定义 */
export const FIELD_CURRENT_DICT = '_currentDict';
/** split_by_dict 时当前已选中的字典条目 */
export const FIELD_CURRENT_SELECTED = '_currentSelected';
/** 任务完成后是否静默（不展示成功 item，直接跳转目标状态） */
export const FIELD_SILENT_ON_SUCCESS = '_silentOnSuccess';
/** 预加载 fetchOptions 时传递的 feature id */
export const FIELD_PREFETCH_FEATURE_ID = '_prefetchFeatureId';
/** 预加载 fetchOptions 时传递的 input 索引 */
export const FIELD_PREFETCH_INPUT_INDEX = '_prefetchInputIndex';
/** 预加载字典列表时传递的 dictKey */
export const FIELD_PREFETCH_DICT_KEY = '_prefetchDictKey';
/** spawnWorker 时生成的 job id（仅 worker 进程内部使用） */
export const FIELD_PREFETCH_JOB_ID = '_prefetchJobId';
/** kafka 消息查询：缓存 key */
export const FIELD_MSG_CACHE_KEY = '_msgCacheKey';
/** kafka 消息查询：解析后的绝对时间字符串 */
export const FIELD_MSG_DATETIME = '_msgDatetime';
/** kafka 消息查询：泳道过滤 code */
export const FIELD_MSG_SWIMLANE = '_msgSwimlane';
/** kafka 消息查询：base topicId */
export const FIELD_MSG_BASE_TOPIC_ID = '_msgBaseTopicId';
/** tenant_base_login 步骤中存储选中登录环境 key 的字段 */
export const FIELD_LOGIN_ENV_KEY = '_loginEnvKey';
/** kafka_topic DictItem 中存储 mafka topic id 的内部字段名 */
export const FIELD_TOPIC_ID = '_topicId';
/** kafka 消费者组预加载：传给 worker 的 topicId */
export const FIELD_CONSUMER_TOPIC_ID = '_consumerTopicId';
/** kafka 消费者组预加载：传给 worker 的缓存 key */
export const FIELD_CONSUMER_CACHE_KEY = '_consumerCacheKey';

// ─── 内部任务名 ─────────────────────────────────────────────────────────────────

/** 预加载字典列表的后台 worker 任务名 */
export const TASK_PREFETCH_DICT = '_prefetch_dict';
/** 预加载 fetchOptions 的后台 worker 任务名 */
export const TASK_PREFETCH_OPTIONS = '_prefetch_options';
/** 预加载 kafka 消息列表的后台 worker 任务名 */
export const TASK_PREFETCH_MESSAGES = '_prefetch_messages';
/** 预加载 kafka 消费者组的后台 worker 任务名 */
export const TASK_PREFETCH_CONSUMERS = '_prefetch_consumers';

/** 租户泳道登录后台任务名 */
export const TASK_LOGIN = 'login_task';
/** 租户 base 登录后台任务名 */
export const TASK_LOGIN_ENV = 'login_env_task';

// ─── 业务配置 ─────────────────────────────────────────────────────────────────

/** 当前用户 MIS 账号，用于 octo 等接口的 mis 参数 */
export const MIS_USERNAME = 'liucheng58';

/** Octo 服务注册中心测试环境 base URL */
export const OCTO_BASE_URL = 'https://octo.mws-test.sankuai.com';

/** Mafka 控制台 base URL */
export const MAFKA_BASE_URL = 'https://mafka.mws-test.sankuai.com';

/** Mafka 请求时所需的前端 appkey 请求头 */
export const MAFKA_HEADERS: Record<string, string> = { 'm-appkey': 'fe_mafka-fe' };

/** resolveEnvTopicId 中查找的目标环境 */
export const MAFKA_TARGET_ENV = 'test';

/** 租户泳道登录 API URL */
export const LOGIN_TASK_API_URL = 'http://www.swiftlc.com/api/qnh/login';

/** SSH 跳板机跳转 base URL（hostIp 作为 query 参数拼接） */
export const JUMPER_BASE_URL = 'https://jumper.mws.sankuai.com/terminal';

/** Dev/Cargo 泳道机器状态 API base URL */
export const CARGO_DEV_BASE_URL = 'https://dev.sankuai.com/gateway/cargo/api';

/** Octo 服务调用代理 URL（用于 octo-invoke 接口） */
export const OCTO_INVOKE_URL = 'http://www.swiftlc.com:8080/api/octo-invoke';

/** 调用 octo-invoke 时，查询租户门店使用的后端 appkey */
export const TENANT_EMPOWER_APPKEY = 'com.sankuai.shangou.empower.tenant';

/** 租户 base 登录的管理后台 path（含鉴权参数） */
export const MANAGEMENT_PATH =
  '/api/sac/account/createManagerAndRelTenant?u2dhn6k=8e8b49cbae29e8a44478a7d7c7a948e2&yodaReady=h5&csecplatform=4&csecversion=4.1.1';

export interface LoginEnvConfig {
  label: string;
  managementUrl: string;
  redirectUrl: string;
}

/** 各环境登录配置，key 对应 _loginEnvKey.value */
export const LOGIN_ENV_CONFIGS: Record<string, LoginEnvConfig> = {
  test_trunk: {
    label: '🧪 测试主干',
    managementUrl: `https://management.shangou.test.meituan.com${MANAGEMENT_PATH}`,
    redirectUrl: 'https://qnh.shangou.test.meituan.com/api/v1/sso/loginRedirect',
  },
  st: {
    label: '🌿 ST',
    managementUrl: `https://management.shangou.st.meituan.com${MANAGEMENT_PATH}`,
    redirectUrl: 'https://qnh.shangou.st.meituan.com/api/v1/sso/loginRedirect',
  },
  prod: {
    label: '🚀 Prod',
    managementUrl: `https://management.vip.sankuai.com${MANAGEMENT_PATH}`,
    redirectUrl: 'https://qnh.meituan.com/api/v1/sso/loginRedirect',
  },
};
