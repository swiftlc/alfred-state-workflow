const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../data/app.log');

class Logger {
  constructor() {
    this.ensureFileExists();
  }

  ensureFileExists() {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '', 'utf8');
    }
  }

  _formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;
    if (Object.keys(meta).length > 0) {
      logLine += ` | ${JSON.stringify(meta)}`;
    }
    return logLine + '\n';
  }

  _write(level, message, meta) {
    try {
      const logLine = this._formatMessage(level, message, meta);
      fs.appendFileSync(LOG_FILE, logLine, 'utf8');
    } catch (e) {
      // 忽略写入日志时的错误，防止死循环
    }
  }

  info(message, meta = {}) {
    this._write('INFO', message, meta);
  }

  warn(message, meta = {}) {
    this._write('WARN', message, meta);
  }

  error(message, error = null, meta = {}) {
    const errorMeta = error ? { ...meta, error: error.message, stack: error.stack } : meta;
    this._write('ERROR', message, errorMeta);
  }

  getLogFilePath() {
    return LOG_FILE;
  }
}

module.exports = new Logger();

