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
 * 检查查询字符串是否匹配目标字符串（支持拼音，支持空格多条件搜索）
 * @param {string} query 查询字符串，多个条件用空格分隔
 * @param {...string} targets 目标字符串列表，任意一个匹配即返回 true
 * @returns {boolean}
 */
function matchQuery(query, ...targets) {
  if (!query) return true;

  // 将查询字符串按空格分割成多个条件，并过滤掉空字符串
  const terms = query.split(/\s+/).filter(t => t.trim() !== '');

  if (terms.length === 0) return true;

  // 必须所有条件都满足（AND 逻辑）
  return terms.every(term => {
    // 对于单个条件，只要 targets 中有一个匹配即可（OR 逻辑）
    return targets.some(target => target && pinyinMatch.match(target, term));
  });
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

