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

  private write(level: LogLevel, message: string, meta: object): void {
    try {
      const logLine = this.formatMessage(level, message, meta);
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

