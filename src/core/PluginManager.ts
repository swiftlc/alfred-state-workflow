import fs from 'fs';
import path from 'path';
import type {Feature, Plugin} from '../types';
import type Workflow from './Workflow';

class PluginManager {
  private pluginsDir: string;
  private plugins: Plugin[];

  constructor() {
    this.pluginsDir = path.join(__dirname, '../../data/plugins');
    this.plugins = [];
    this.loadPlugins();
  }

  private loadPlugins(): void {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    const files = fs.readdirSync(this.pluginsDir);
    for (const file of files) {
      const ext = path.extname(file);
      if (ext === '.js' || ext === '.json') {
        try {
          const pluginPath = path.join(this.pluginsDir, file);
          // 清除 require 缓存，支持运行时重新加载
          delete require.cache[require.resolve(pluginPath)];
          const plugin = require(pluginPath) as Plugin | Plugin[];

          if (Array.isArray(plugin)) {
            this.plugins.push(...plugin);
          } else {
            this.plugins.push(plugin);
          }
        } catch (err) {
          console.error(`Failed to load plugin ${file}:`, err);
        }
      }
    }
  }

  getFeatures(): Feature[] {
    const features: Feature[] = [];
    for (const plugin of this.plugins) {
      if (plugin.feature) {
        features.push(plugin.feature);
      } else if (plugin.id && plugin.name) {
        // 插件直接就是一个 Feature 对象
        features.push(plugin as unknown as Feature);
      }
    }
    return features;
  }

  registerActions(app: Workflow): void {
    for (const plugin of this.plugins) {
      if (plugin.feature && plugin.actionHandler) {
        app.onAction(plugin.feature.action, plugin.actionHandler);
      } else if (plugin.action && plugin.actionHandler) {
        app.onAction(plugin.action, plugin.actionHandler);
      }
    }
  }
}

export default new PluginManager();

