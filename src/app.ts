import Workflow from './core/Workflow';
import registerStates from './handlers/states';
import registerActions from './handlers/actions';
import PluginManager from './core/PluginManager';

// 初始化 Workflow 实例
// triggerName 对应 Alfred External Trigger 的 Identifier
const app = new Workflow({
  triggerName: 'flow',
});

// 注册状态机 (Script Filter 逻辑)
registerStates(app);

// 注册执行动作 (Run Script 逻辑)
registerActions(app);

// 注册插件动作
PluginManager.registerActions(app);

export default app;

