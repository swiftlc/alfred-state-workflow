const pinyinMatch = require('pinyin-match');

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

module.exports = {
  encodeContext,
  decodeContext,
  matchQuery
};

