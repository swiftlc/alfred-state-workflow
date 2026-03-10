const fs = require('fs');
const path = require('path');

class PluginManager {
  constructor() {
    this.pluginsDir = path.join(__dirname, '../../data/plugins');
    this.plugins = [];
    this.loadPlugins();
  }

  loadPlugins() {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    const files = fs.readdirSync(this.pluginsDir);
    for (const file of files) {
      const ext = path.extname(file);
      if (ext === '.js' || ext === '.json') {
        try {
          const pluginPath = path.join(this.pluginsDir, file);
          // Clear require cache to allow dynamic reloading if needed
          delete require.cache[require.resolve(pluginPath)];
          const plugin = require(pluginPath);

          // A plugin can be a single feature object, an array of feature objects,
          // or an object containing { feature: ..., actionHandler: ... }
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

  getFeatures() {
    const features = [];
    for (const plugin of this.plugins) {
      if (plugin.feature) {
        features.push(plugin.feature);
      } else if (plugin.id && plugin.name) {
        // It's just a feature object
        features.push(plugin);
      }
    }
    return features;
  }

  registerActions(app) {
    for (const plugin of this.plugins) {
      if (plugin.feature && plugin.actionHandler) {
        app.onAction(plugin.feature.action, plugin.actionHandler);
      } else if (plugin.action && plugin.actionHandler) {
        app.onAction(plugin.action, plugin.actionHandler);
      }
    }
  }
}

module.exports = new PluginManager();

