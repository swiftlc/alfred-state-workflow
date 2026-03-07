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
      TaskManager.updateTask(jobId, { progress, message });
    }
  };

  try {
    await handler(taskUpdater, context, app);
    TaskManager.updateTask(jobId, { status: 'done', progress: 100 });
  } catch (err) {
    TaskManager.updateTask(jobId, { status: 'error', message: err.message });
  }
}

main();

