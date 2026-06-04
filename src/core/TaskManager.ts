import { iGet, iPost, iPatch, iDelete } from './internalHttp';
import type { TaskData, TaskStatus } from '../types';

class TaskManager {
  static async initTask(jobId: string, name: string): Promise<TaskData> {
    return iPost<TaskData>(`/internal/tasks/${jobId}/init`, { name });
  }

  static async updateTask(jobId: string, updates: Partial<TaskData>): Promise<TaskData> {
    return iPatch<TaskData>(`/internal/tasks/${jobId}`, updates);
  }

  static async getTask(jobId: string): Promise<TaskData | null> {
    return iGet<TaskData | null>(`/internal/tasks/${jobId}`);
  }

  static async getAllTasks(): Promise<TaskData[]> {
    return iGet<TaskData[]>('/internal/tasks');
  }

  static async deleteTask(jobId: string): Promise<void> {
    await iDelete<null>(`/internal/tasks/${jobId}`);
  }

  static async clearTasks(statusFilter: TaskStatus | TaskStatus[] | null = null): Promise<void> {
    if (!statusFilter) {
      await iDelete<null>('/internal/tasks');
      return;
    }
    const tasks = await this.getAllTasks();
    const toDelete = tasks.filter((t) =>
      Array.isArray(statusFilter) ? statusFilter.includes(t.status) : t.status === statusFilter
    );
    await Promise.all(toDelete.map((t) => iDelete<null>(`/internal/tasks/${t.id}`)));
  }
}

export default TaskManager;
