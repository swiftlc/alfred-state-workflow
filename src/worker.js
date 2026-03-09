const app = require('./app');
const TaskManager = require('./core/TaskManager');
const { decodeContext } = require('./core/utils');

async function main() {
  const [,, taskName, jobId, contextStr] = process.argv;
  const context = decodeContext(contextStr);

  const handler = app.tasks[taskName];
  if (!handler) {
    TaskManager.updateTask(jobId, { status: 'error', message: `Task ${taskName} not found` });
    return;
  }

  const taskUpdater = {
    update: (progress, message) => {
      // 每次更新前检查任务是否已被取消
      const currentTask = TaskManager.getTask(jobId);
      if (currentTask && currentTask.status === 'cancelled') {
        throw new Error('Task was cancelled by user');
      }
      TaskManager.updateTask(jobId, { progress, message });
    },
    isCancelled: () => {
      const currentTask = TaskManager.getTask(jobId);
      return currentTask && currentTask.status === 'cancelled';
    }
  };

  try {
    await handler(taskUpdater, context, app);

    // 再次检查，防止在最后一步被取消
    if (!taskUpdater.isCancelled()) {
      TaskManager.updateTask(jobId, { status: 'done', progress: 100 });
    }
  } catch (err) {
    if (err.message === 'Task was cancelled by user') {
      // 已经被标记为 cancelled，不需要再更新为 error
      console.log('Task cancelled');
    } else {
      TaskManager.updateTask(jobId, { status: 'error', message: err.message });
    }
  }
}

main();

