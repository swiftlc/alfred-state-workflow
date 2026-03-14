import path from 'path';

/** 图标根目录（相对于项目根目录的 assets/icons/） */
const ICONS_DIR = path.join(__dirname, '../../assets/icons');

/**
 * 项目内置图标路径常量
 *
 * Alfred 的 icon.path 支持相对路径（相对于 workflow 根目录）和绝对路径。
 * 此处统一使用绝对路径，确保在任意工作目录下均可正确加载。
 */
const Icons = {
  /** 主 Workflow 入口图标 */
  workflow: path.join(ICONS_DIR, 'workflow.svg'),

  /** 登录 / 认证 */
  login: path.join(ICONS_DIR, 'login.svg'),

  /** 后台任务 / 进度 */
  task: path.join(ICONS_DIR, 'task.svg'),

  /** 历史记录 */
  history: path.join(ICONS_DIR, 'history.svg'),

  /** 插件系统 */
  plugin: path.join(ICONS_DIR, 'plugin.svg'),

  /** 缓存管理 */
  cache: path.join(ICONS_DIR, 'cache.svg'),

  /** 搜索 / 过滤 */
  search: path.join(ICONS_DIR, 'search.svg'),

  /** 上下文 / 字典 */
  context: path.join(ICONS_DIR, 'context.svg'),
} as const;

export type IconKey = keyof typeof Icons;

/** 返回 Alfred item icon 对象（{ path } 格式） */
export function icon(key: IconKey): { path: string } {
  return { path: Icons[key] };
}

export default Icons;

