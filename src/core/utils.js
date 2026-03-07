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

module.exports = {
  encodeContext,
  decodeContext
};

