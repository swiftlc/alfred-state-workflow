/**
 * SonicConfigManager — 持久化 Sonic 热部署配置
 *
 * 使用 CacheManager（TTL=0）实现跨会话持久化，配置内容：
 *   - projectRoot:  Java 项目根目录（用户首次配置后记住）
 *   - mavenModule:  Maven 子模块名（可为空，空 = 全量编译）
 *   - pomHash:      pom.xml 内容 hash（变化时重建 classpath 缓存）
 *   - classpathCachedAt: .sonic-classpath 最后生成时间戳
 */

import CacheManager from './CacheManager';

const CONFIG_KEY = 'sonic:config';

export interface SonicConfig {
  /** Java 项目根目录，如 /Users/xxx/code/myproject */
  projectRoot?: string;
  /** Maven 子模块，如 server；空字符串表示根模块 */
  mavenModule?: string;
  /** pom.xml md5 hash，用于判断是否需要重建 classpath 缓存 */
  pomHash?: string;
  /** .sonic-classpath 文件最后生成的时间戳 */
  classpathCachedAt?: number;
}

const SonicConfigManager = {
  /** 读取配置（不存在时返回空对象） */
  async get(): Promise<SonicConfig> {
    return (await CacheManager.get<SonicConfig>(CONFIG_KEY)) ?? {};
  },

  /** 合并更新配置（局部更新，不覆盖未传字段） */
  async save(patch: Partial<SonicConfig>): Promise<void> {
    const current = await this.get();
    await CacheManager.set<SonicConfig>(CONFIG_KEY, { ...current, ...patch }, 0); // TTL=0: 永不过期
  },

  /** 清除配置（主要用于调试） */
  async clear(): Promise<void> {
    await CacheManager.clear(CONFIG_KEY);
  },
};

export default SonicConfigManager;
