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
}

module.exports = TaskManager;

