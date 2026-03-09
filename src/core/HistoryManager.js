const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../../data/history.json');
const MAX_HISTORY = 3;

class HistoryManager {
  constructor() {
    this.ensureFileExists();
  }

  ensureFileExists() {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify([]), 'utf8');
    }
  }

  getHistory() {
    try {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  addHistory(record) {
    let history = this.getHistory();

    // 移除重复的记录（基于 action 和 data 判断）
    history = history.filter(item => {
      return !(item.action === record.action && JSON.stringify(item.data) === JSON.stringify(record.data));
    });

    // 添加新记录到头部
    history.unshift({
      ...record,
      timestamp: Date.now()
    });

    // 限制最大数量
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  }
}

module.exports = new HistoryManager();

