import app from './app';
import TaskManager from './core/TaskManager';
import {decodeContext} from './core/utils';
import type {Context, TaskUpdater} from './types';

async function main(): Promise<void> {
  const [, , taskName, jobId, contextStr] = process.argv as string[];

  if (!taskName || !jobId || !contextStr) {
    console.error('worker: missing required arguments');
    process.exit(1);
  }

  const context = decodeContext(contextStr) as Context | null;
  if (!context) {
    TaskManager.updateTask(jobId, { status: 'error', message: 'Invalid context' });
    return;
  }

  // spawnWorker 不会预先 initTask，这里按需初始化
  if (!TaskManager.getTask(jobId)) {
    TaskManager.initTask(jobId, taskName);
  }

  const handler = app.tasks[taskName];
  if (!handler) {
    TaskManager.updateTask(jobId, { status: 'error', message: `Task ${taskName} not found` });
    return;
  }

  const taskUpdater: TaskUpdater = {
    update: (progress: number, message: string) => {
      // 每次更新前检查任务是否已被取消
      const currentTask = TaskManager.getTask(jobId);
      if (currentTask?.status === 'cancelled') {
        throw new Error('Task was cancelled by user');
      }
      TaskManager.updateTask(jobId, { progress, message });
    },
    isCancelled: () => {
      const currentTask = TaskManager.getTask(jobId);
      return currentTask?.status === 'cancelled' || false;
    },
  };

  try {
    await handler(taskUpdater, context, app);

    if (!taskUpdater.isCancelled()) {
      TaskManager.updateTask(jobId, { status: 'done', progress: 100 });
    }
  } catch (err) {
    const error = err as Error;
    if (error.message === 'Task was cancelled by user') {
      console.log('Task cancelled');
    } else {
      TaskManager.updateTask(jobId, { status: 'error', message: error.message });
    }
  }
}

main().catch(console.error);

