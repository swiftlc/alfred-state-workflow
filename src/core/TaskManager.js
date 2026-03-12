const fs = require('fs');
const path = require('path');
const os = require('os');

const JOBS_DIR = path.join(os.tmpdir(), 'alfred_workflow_jobs');
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

class TaskManager {
  static getJobFile(jobId) {
    return path.join(JOBS_DIR, `${jobId}.json`);
  }

  static initTask(jobId, name) {
    const data = { id: jobId, name, status: 'running', progress: 0, message: 'Initializing...', spinnerIdx: 0 };
    fs.writeFileSync(this.getJobFile(jobId), JSON.stringify(data));
    return data;
  }

  static updateTask(jobId, updates) {
    const file = this.getJobFile(jobId);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      Object.assign(data, updates);
      fs.writeFileSync(file, JSON.stringify(data));
    }
  }

  static getTask(jobId) {
    const file = this.getJobFile(jobId);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    return null;
  }

  static getAllTasks() {
    const tasks = [];
    const files = fs.readdirSync(JOBS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, file), 'utf8'));
          tasks.push(data);
        } catch (e) {
          // Ignore invalid files
        }
      }
    }
    // Sort by creation time (extracted from jobId: job_timestamp_random)
    return tasks.sort((a, b) => {
      const timeA = parseInt(a.id.split('_')[1]) || 0;
      const timeB = parseInt(b.id.split('_')[1]) || 0;
      return timeB - timeA; // Newest first
    });
  }

  static clearTasks(statusFilter = null) {
    const files = fs.readdirSync(JOBS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(JOBS_DIR, file);
        try {
          if (statusFilter) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (data.status === statusFilter || (Array.isArray(statusFilter) && statusFilter.includes(data.status))) {
              fs.unlinkSync(filePath);
            }
          } else {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }
  }
}

module.exports = TaskManager;

