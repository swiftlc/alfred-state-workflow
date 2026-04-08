import fs from 'fs';
import path from 'path';
import os from 'os';
import type {TaskData, TaskStatus} from '../types';

const JOBS_DIR = path.join(os.tmpdir(), 'alfred_workflow_jobs');
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

class TaskManager {
  static getJobFile(jobId: string): string {
    return path.join(JOBS_DIR, `${jobId}.json`);
  }

  static initTask(jobId: string, name: string): TaskData {
    const data: TaskData = {
      id: jobId,
      name,
      status: 'running',
      progress: 0,
      message: 'Initializing...',
      spinnerIdx: 0,
    };
    fs.writeFileSync(this.getJobFile(jobId), JSON.stringify(data));
    return data;
  }

  static updateTask(jobId: string, updates: Partial<TaskData>): void {
    const file = this.getJobFile(jobId);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as TaskData;
      Object.assign(data, updates);
      // 状态首次变为终态时记录完结时间
      if (updates.status && updates.status !== 'running' && !data.completedAt) {
        data.completedAt = Date.now();
      }
      fs.writeFileSync(file, JSON.stringify(data));
    }
  }

  static getTask(jobId: string): TaskData | null {
    const file = this.getJobFile(jobId);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as TaskData;
    }
    return null;
  }

  private static readonly ORPHAN_TTL = 24 * 60 * 60 * 1000; // 24h

  /** 清理孤儿任务文件：终态超过 24h 或文件 mtime 超过 24h 的任务 */
  private static cleanOrphanFiles(): void {
    const now = Date.now();
    try {
      const files = fs.readdirSync(JOBS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(JOBS_DIR, file);
        try {
          const stat = fs.statSync(filePath);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as TaskData;
          const isTerminal = data.status !== 'running';
          const completedAge = data.completedAt ? now - data.completedAt : null;
          const mtimeAge = now - stat.mtimeMs;
          if (
            (isTerminal && completedAge !== null && completedAge > TaskManager.ORPHAN_TTL) ||
            (isTerminal && mtimeAge > TaskManager.ORPHAN_TTL)
          ) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // 忽略损坏的文件
        }
      }
    } catch {
      // 忽略目录读取错误
    }
  }

  static getAllTasks(): TaskData[] {
    TaskManager.cleanOrphanFiles();
    const tasks: TaskData[] = [];
    const files = fs.readdirSync(JOBS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = JSON.parse(
            fs.readFileSync(path.join(JOBS_DIR, file), 'utf8')
          ) as TaskData;
          tasks.push(data);
        } catch {
          // 忽略损坏的文件
        }
      }
    }
    // 按创建时间倒序（jobId 格式：job_timestamp_random）
    return tasks.sort((a, b) => {
      const timeA = parseInt(a.id.split('_')[1] ?? '0', 10);
      const timeB = parseInt(b.id.split('_')[1] ?? '0', 10);
      return timeB - timeA;
    });
  }

  static clearTasks(statusFilter: TaskStatus | TaskStatus[] | null = null): void {
    const files = fs.readdirSync(JOBS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(JOBS_DIR, file);
        try {
          if (statusFilter) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as TaskData;
            const match = Array.isArray(statusFilter)
              ? statusFilter.includes(data.status)
              : data.status === statusFilter;
            if (match) fs.unlinkSync(filePath);
          } else {
            fs.unlinkSync(filePath);
          }
        } catch {
          // 忽略错误
        }
      }
    }
  }
}

export default TaskManager;

