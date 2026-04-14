// ─── 字典相关 ──────────────────────────────────────────────────────────────────

/** 字典类型定义（如租户、泳道、环境等） */
export interface DictCategory {
  key: string;
  name: string;
  /** 字典列表缓存有效期（毫秒），不填默认 5 分钟 */
  cacheTtl?: number;
  /** 只读字典：禁止删除条目（仍可置顶/修改描述），默认 false */
  readonly?: boolean;
  /**
   * 自定义条目获取函数。配置后 getDictionaryItems 直接调用此函数，
   * 不再走默认的 REST 接口。缓存逻辑（cacheTtl）仍由框架统一管理。
   * 可选接收 contextData，用于依赖其他字典值的动态字典（如 kafka_topic 依赖 appkey）。
   */
  fetchItems?: (contextData?: ContextData) => Promise<DictItem[]>;
  /**
   * 自定义 cacheKey 生成函数，用于 context 相关的动态字典（如 kafka_topic 依赖 appkey）。
   * 不配置时使用 DictService.getCacheKey(key) 默认规则。
   */
  getCacheKey?: (contextData?: ContextData) => string;
  /** 接口不可用时的兜底数据，不配置则降级返回空数组 */
  fallbackItems?: DictItem[];
  /** 是否允许修改字典条目描述，默认 true；设为 false 时该字典不出现在「修改描述」功能中 */
  allowDescriptionEdit?: boolean;
  /**
   * 复制字典项时的取值方式：
   * - 'value'：仅复制 item.value
   * - 'json'：复制完整 JSON（默认）
   * - function：动态生成复制内容，入参为选中的 DictItem
   */
  copyValue?: 'value' | 'json' | ((item: DictItem) => string);
}

/** 字典选项（某个字典类型下的一条具体数据） */
export interface DictItem {
  id?: string;
  name: string;
  value?: string;
  description?: string;
  /** 是否为用户手动输入的临时条目 */
  isManual?: boolean;
  /** 允许附带任意原始字段（来自接口返回）*/
  [key: string]: unknown;
}

// ─── 上下文 ────────────────────────────────────────────────────────────────────

/** Script Filter / Action 之间传递的上下文数据（字典已选项的 Map） */
export type ContextData = Record<string, DictItem>;

/** 完整的运行时 Context，贯穿整个状态机 */
export interface Context {
  /** 当前状态名 */
  state: string;
  /** 已选字典数据 */
  data: ContextData;
  /** 当前搜索词（仅 filter 阶段有值） */
  query?: string;
  /** 当前正在执行的动作名 */
  action?: string;
  /** 待执行的功能 id（用于多步骤引导流程） */
  pendingAction?: string;
  /** 多步骤输入的当前索引 */
  inputIndex?: number;
  /** 后台任务 id */
  jobId?: string;
  /** 用于导航回上一个状态 */
  nextState?: string;
  returnState?: string;
  /** 历史记录相关 */
  historyTitle?: string;
  historySubtitle?: string;
  recordHistory?: boolean;
  /** 剪贴板相关 */
  copyValue?: string;
  copyName?: string;
  copyKey?: string;
  /** 历史记录条目 id（固定/删除操作使用） */
  id?: string;
  /** 允许扩展任意字段 */
  [key: string]: unknown;
}

// ─── Alfred Item ───────────────────────────────────────────────────────────────

/** Alfred Script Filter 返回的单个 Item 的 mod 描述 */
export interface AlfredItemMod {
  subtitle?: string;
  arg?: string;
  valid?: boolean;
  icon?: { path: string };
}

/** Alfred Script Filter 返回的单个列表项 */
export interface AlfredItem {
  title: string;
  subtitle?: string;
  arg?: string;
  valid?: boolean;
  icon?: { path: string };
  mods?: {
    cmd?: AlfredItemMod;
    alt?: AlfredItemMod;
    ctrl?: AlfredItemMod;
    shift?: AlfredItemMod;
    fn?: AlfredItemMod;
  };
  /** 允许附带任意扩展字段 */
  [key: string]: unknown;
}

/** Alfred Script Filter 完整输出（支持 rerun） */
export interface AlfredFilterOutput {
  items: AlfredItem[];
  rerun?: number;
}

// ─── 功能定义 ──────────────────────────────────────────────────────────────────

/** 需要用户手动输入/选择的参数定义 */
export interface RequiredInput {
  /** 存入 context.data 的 key */
  key: string;
  /** 展示标签 */
  label: string;
  /** 占位提示 */
  placeholder?: string;
  /** 是否禁用手动输入（仅允许从列表选择） */
  disableManualInput?: boolean;
  /**
   * 动态获取候选选项。
   * 只需编写真实的 fetch 逻辑，缓存由框架根据 cacheKey + cacheTtl 自动处理。
   */
  fetchOptions?: (query: string, contextData: ContextData) => Promise<DictItem[]>;
  /** 跳过条件：返回 true 时跳过此步骤，直接进入下一步或执行 action */
  skipIf?: (contextData: ContextData) => boolean;
  /**
   * fetchOptions 对应的缓存 key 生成函数。
   * 提供此字段后，input_state 会走非阻塞加载模式：
   * 缓存未命中时启动后台 task 发起请求，Alfred rerun 轮询直到数据就绪。
   */
  cacheKey?: (contextData: ContextData) => string;
  /**
   * 缓存有效期（毫秒）。与 cacheKey 配合使用，框架自动对 fetchOptions 结果应用缓存。
   * 不填默认 60 秒。
   */
  cacheTtl?: number;
}

/** 功能定义 */
export interface Feature {
  id: string;
  /** 支持静态字符串或根据上下文动态生成 */
  name: string | ((data: ContextData) => string);
  description: string | ((data: ContextData) => string);
  /** 该功能依赖的字典 key 列表 */
  requiredKeys: string[];
  /** 对应的 action 名称 */
  action: string;
  /** 功能类型：split_by_dict 表示对所有已选字典项各生成一个条目 */
  type?: 'split_by_dict' | string;
  /** 当 type 为 split_by_dict 时，排除指定 category key，不对这些字典进行裂变 */
  excludeKeys?: string[];
  /** 当 type 为 split_by_dict 时，动态排除字典：返回 true 则排除该字典 */
  excludeWhen?: (dict: DictCategory) => boolean;
  /** 附加条件：返回 false 时不展示此功能 */
  condition?: (data: ContextData) => boolean;
  /** 是否记录到历史，默认 true */
  recordHistory?: boolean;
  /** 多步骤输入参数定义 */
  requiredInputs?: RequiredInput[];
  /** 内联 action 处理函数（无需在 actions.ts 中单独注册） */
  actionHandler?: ActionHandler;
  /** Alfred 列表项图标（{ path } 格式，路径指向 SVG/PNG） */
  icon?: { path: string };
  /** split_by_dict 类型的一级菜单标题（静态字符串，不含字典项信息） */
  label?: string;
}

// ─── 任务相关 ──────────────────────────────────────────────────────────────────

export type TaskStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface TaskData {
  id: string;
  name: string;
  status: TaskStatus;
  progress: number;
  message: string;
  spinnerIdx: number;
  /** 任务完结时间戳（done/error/cancelled 时自动记录） */
  completedAt?: number;
}

/** worker.js 中传入 task handler 的 updater 对象 */
export interface TaskUpdater {
  update: (progress: number, message: string) => void;
  isCancelled: () => boolean;
}

// ─── 历史记录 ──────────────────────────────────────────────────────────────────

export interface HistoryRecord {
  id: string;
  title: string;
  subtitle?: string;
  action: string;
  data: ContextData;
  copyValue?: string;
  copyName?: string;
  copyKey?: string;
  timestamp: number;
  isPinned: boolean;
}

// ─── 工作区快照 ────────────────────────────────────────────────────────────────

/** 工作区快照：保存一组完整的字典上下文，支持一键恢复 */
export interface WorkspaceRecord {
  /** 唯一 ID */
  id: string;
  /** 工作区名称（用户命名） */
  name: string;
  /** 快照时保存的字典上下文数据 */
  data: ContextData;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后使用时间戳 */
  lastUsedAt: number;
  /** 使用次数 */
  usageCount: number;
}

// ─── 智能别名 ──────────────────────────────────────────────────────────────────

/** 智能别名：将一个完整的「上下文 + 动作」绑定到短词，一步直达执行 */
export interface AliasRecord {
  /** 唯一 ID */
  id: string;
  /** 别名触发词（如 "login-dev"、"lgd"） */
  alias: string;
  /** 对应的 action 名称 */
  action: string;
  /** 执行时传入的上下文数据快照 */
  data: ContextData;
  /** 展示标题（如「🚀 租户泳道登录」） */
  title: string;
  /** 展示副标题 */
  subtitle?: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后使用时间戳 */
  lastUsedAt: number;
  /** 使用次数 */
  usageCount: number;
}

// ─── 插件 ──────────────────────────────────────────────────────────────────────

export interface Plugin {
  /** 以 feature + actionHandler 形式定义的插件 */
  feature?: Feature;
  actionHandler?: ActionHandler;
  /** 直接以 Feature 对象形式定义的插件 */
  id?: string;
  name?: string | ((data: ContextData) => string);
  action?: string;
}

// ─── Handler 类型 ──────────────────────────────────────────────────────────────

import type Workflow from './core/Workflow';

/** State handler：返回 AlfredItem 数组或完整 AlfredFilterOutput */
export type StateHandler = (
  context: Context,
  wf: Workflow
) => Promise<AlfredItem[] | AlfredFilterOutput>;

/** Action handler */
export type ActionHandler = (
  context: Context,
  wf: Workflow
) => Promise<void>;

/** Task handler */
export type TaskHandler = (
  task: TaskUpdater,
  context: Context,
  wf?: Workflow
) => Promise<void>;

