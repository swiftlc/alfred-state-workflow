// ─── 字典相关 ──────────────────────────────────────────────────────────────────

/** 字典类型定义（如租户、泳道、环境等） */
export interface DictCategory {
  key: string;
  name: string;
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
  /** 动态获取候选选项 */
  fetchOptions?: (query: string, contextData: ContextData) => Promise<DictItem[]>;
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
  /** 附加条件：返回 false 时不展示此功能 */
  condition?: (data: ContextData) => boolean;
  /** 是否记录到历史，默认 true */
  recordHistory?: boolean;
  /** 多步骤输入参数定义 */
  requiredInputs?: RequiredInput[];
  /** 内联 action 处理函数（无需在 actions.ts 中单独注册） */
  actionHandler?: ActionHandler;
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

