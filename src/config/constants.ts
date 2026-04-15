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
