/**
 * 时间解析工具
 *
 * 支持以下格式：
 * - 绝对时间：'YYYY-MM-DD HH:mm:ss'、'HH:mm:ss'、'HH:mm'
 *   - 仅时间部分（如 '22:00'）表示今天的该时刻
 * - 相对时间（向前推算）：
 *   - '2d'、'2h'、'30m'、'10s' — 单一单位
 *   - '2h30m'、'1d2h3m4s' — 组合单位
 *   - '2h3s' — 跨单位组合
 *   - 中文：'2小时前'、'30分钟前'、'1天前'、'2小时3秒前'
 *   - 纯数字：'22' 表示 22 秒前
 *
 * 返回格式：'YYYY-MM-DD HH:mm:ss'（mafka 接口所需格式）
 */

const pad = (n: number) => String(n).padStart(2, '0');

function formatDatetime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 解析相对/绝对时间字符串，返回 'YYYY-MM-DD HH:mm:ss' 格式。
 * 解析失败返回 null。
 */
export function parseQueryDatetime(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // ── 绝对时间：YYYY-MM-DD HH:mm:ss ──────────────────────────────────────────
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const d = new Date(s.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return formatDatetime(d);
  }

  // ── 绝对时间：HH:mm:ss 或 HH:mm（今天） ────────────────────────────────────
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(':').map(Number);
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parts[0], parts[1], parts[2] ?? 0);
    if (!isNaN(d.getTime())) return formatDatetime(d);
  }

  // ── 相对时间：英文/中文混合 ─────────────────────────────────────────────────
  // 将中文单位统一为英文
  const normalized = s
    .replace(/天/g, 'd')
    .replace(/小时|时/g, 'h')
    .replace(/分钟|分/g, 'm')
    .replace(/秒/g, 's')
    .replace(/前/g, '')
    .replace(/\s+/g, '');

  // 纯数字：视为秒前
  if (/^\d+$/.test(normalized)) {
    const sec = parseInt(normalized, 10);
    return formatDatetime(new Date(Date.now() - sec * 1000));
  }

  // 解析 Xd Xh Xm Xs 组合（每个单位可选）
  const relPattern = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
  const match = normalized.match(relPattern);
  if (match && normalized.length > 0) {
    const days = parseInt(match[1] ?? '0', 10);
    const hours = parseInt(match[2] ?? '0', 10);
    const mins = parseInt(match[3] ?? '0', 10);
    const secs = parseInt(match[4] ?? '0', 10);
    const totalMs = ((days * 24 + hours) * 60 + mins) * 60 * 1000 + secs * 1000;
    if (totalMs > 0) {
      return formatDatetime(new Date(Date.now() - totalMs));
    }
  }

  return null;
}

/**
 * 将用户输入的时间字符串解析为 mafka 接口所需的 datetime 字符串。
 * 解析失败时返回当前时间。
 */
export function resolveQueryDatetime(input?: string): string {
  if (!input) return formatDatetime(new Date());
  return parseQueryDatetime(input) ?? formatDatetime(new Date());
}
