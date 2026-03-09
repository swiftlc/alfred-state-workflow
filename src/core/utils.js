const pinyinMatch = require('pinyin-match');
const { execSync } = require('child_process');

function encodeContext(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function decodeContext(str) {
  if (!str) return null;
  try {
    return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * 检查查询字符串是否匹配目标字符串（支持拼音）
 * @param {string} query 查询字符串
 * @param {...string} targets 目标字符串列表，任意一个匹配即返回 true
 * @returns {boolean}
 */
function matchQuery(query, ...targets) {
  if (!query) return true;
  return targets.some(target => target && pinyinMatch.match(target, query));
}

/**
 * 复制内容到剪切板
 * @param {string} text 要复制的文本
 */
function copyToClipboard(text) {
  if (!text) return;
  // 转义双引号和反斜杠，防止命令注入
  const safeText = text.replace(/(["\\])/g, '\\$1');
  execSync(`echo "${safeText}" | pbcopy`);
}

/**
 * 发送系统通知
 * @param {string} message 通知内容
 * @param {string} [title="Alfred Workflow"] 通知标题
 */
function sendNotification(message, title = "Alfred Workflow") {
  if (!message) return;
  const safeMessage = message.replace(/(["\\])/g, '\\$1');
  const safeTitle = title.replace(/(["\\])/g, '\\$1');
  execSync(`osascript -e 'display notification "${safeMessage}" with title "${safeTitle}"'`);
}

/**
 * 在默认浏览器中打开 URL
 * @param {string} url 要打开的链接
 */
function openUrl(url) {
  if (!url) return;
  const safeUrl = url.replace(/(["\\])/g, '\\$1');
  execSync(`open "${safeUrl}"`);
}

module.exports = {
  encodeContext,
  decodeContext,
  matchQuery,
  copyToClipboard,
  sendNotification,
  openUrl
};

