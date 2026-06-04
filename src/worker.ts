import app from './app';
import TaskManager from './core/TaskManager';
import { decodeContext } from './core/utils';
import type { Context, TaskData, TaskUpdater } from './types';

async function main(): Promise<void> {
  const [, , taskName, jobId, contextStr] = process.argv as string[];

  if (!taskName || !jobId || !contextStr) {
    console.error('worker: missing required arguments');
    process.exit(1);
  }

  const context = decodeContext(contextStr) as Context | null;
  if (!context) {
    await TaskManager.updateTask(jobId, { status: 'error', message: 'Invalid context' });
    return;
  }

  const existing = await TaskManager.getTask(jobId);
  if (!existing) {
    await TaskManager.initTask(jobId, taskName);
  }

  const handler = app.tasks[taskName];
  if (!handler) {
    await TaskManager.updateTask(jobId, { status: 'error', message: `Task ${taskName} not found` });
    return;
  }

  const taskUpdater: TaskUpdater = {
    update: async (progress: number, message: string): Promise<void> => {
      const result = await TaskManager.updateTask(jobId, { progress, message }) as TaskData & { cancelled?: boolean };
      if (result.cancelled) {
        throw new Error('Task was cancelled by user');
      }
    },
    isCancelled: async (): Promise<boolean> => {
      const task = await TaskManager.getTask(jobId);
      return task?.status === 'cancelled' || false;
    },
  };

  try {
    await handler(taskUpdater, context, app);

    if (!(await taskUpdater.isCancelled())) {
      await TaskManager.updateTask(jobId, { status: 'done', progress: 100 });
    }
  } catch (err) {
    const error = err as Error;
    if (error.message === 'Task was cancelled by user') {
      console.log('Task cancelled');
    } else {
      await TaskManager.updateTask(jobId, { status: 'error', message: error.message });
    }
  }
}

main().catch(console.error);
