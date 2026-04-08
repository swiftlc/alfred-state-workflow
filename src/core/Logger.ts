import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(__dirname, '../../data/app.log');

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

class Logger {
  constructor() {
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '', 'utf8');
    }
  }

  private formatMessage(level: LogLevel, message: string, meta: object = {}): string {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;
    if (Object.keys(meta).length > 0) {
      logLine += ` | ${JSON.stringify(meta)}`;
    }
    return logLine + '\n';
  }

  private static readonly MAX_LOG_SIZE = 5 * 1024 * 1024;   // 5MB
  private static readonly KEEP_LOG_SIZE = 1 * 1024 * 1024;  // 超限后保留最新 1MB

  private write(level: LogLevel, message: string, meta: object): void {
    try {
      const logLine = this.formatMessage(level, message, meta);
      // 超过大小限制时截断，只保留末尾部分
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > Logger.MAX_LOG_SIZE) {
        const fd = fs.openSync(LOG_FILE, 'r');
        const buf = Buffer.alloc(Logger.KEEP_LOG_SIZE);
        fs.readSync(fd, buf, 0, Logger.KEEP_LOG_SIZE, stat.size - Logger.KEEP_LOG_SIZE);
        fs.closeSync(fd);
        // 从第一个换行符处截齐，避免首行残缺
        const firstNewline = buf.indexOf('\n');
        const trimmed = firstNewline >= 0 ? buf.slice(firstNewline + 1) : buf;
        fs.writeFileSync(LOG_FILE, trimmed, 'utf8');
      }
      fs.appendFileSync(LOG_FILE, logLine, 'utf8');
    } catch {
      // 忽略写入日志时的错误，防止死循环
    }
  }

  info(message: string, meta: object = {}): void {
    this.write('INFO', message, meta);
  }

  warn(message: string, meta: object = {}): void {
    this.write('WARN', message, meta);
  }

  error(message: string, error: Error | null = null, meta: object = {}): void {
    const errorMeta = error
      ? { ...meta, error: error.message, stack: error.stack }
      : meta;
    this.write('ERROR', message, errorMeta);
  }

  getLogFilePath(): string {
    return LOG_FILE;
  }
}

export default new Logger();

