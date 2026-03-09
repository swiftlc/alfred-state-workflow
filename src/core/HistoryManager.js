const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HISTORY_FILE = path.join(__dirname, '../../data/history.json');
const MAX_UNPINNED_HISTORY = 10; // 增加未固定历史的保存数量

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
      id: crypto.randomUUID(),
      ...record,
      timestamp: Date.now(),
      isPinned: false
    });

    // 分离固定和未固定的记录
    const pinned = history.filter(h => h.isPinned);
    const unpinned = history.filter(h => !h.isPinned).slice(0, MAX_UNPINNED_HISTORY);

    // 合并并排序：固定的在前，然后按时间倒序
    history = [...pinned, ...unpinned];
    history.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.timestamp - a.timestamp;
    });

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  }

  togglePin(id) {
    let history = this.getHistory();
    const item = history.find(h => h.id === id);
    if (item) {
      item.isPinned = !item.isPinned;

      // 重新排序
      history.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.timestamp - a.timestamp;
      });

      fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
    }
  }

  deleteHistory(id) {
    let history = this.getHistory();
    history = history.filter(h => h.id !== id);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  }

  clearAll() {
    // 只清空未固定的历史，保留已固定的
    let history = this.getHistory();
    history = history.filter(h => h.isPinned);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  }
}

module.exports = new HistoryManager();

