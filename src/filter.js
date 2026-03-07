const app = require('./app');

async function main() {
  // 优先从环境变量读取，如果没有则尝试从命令行参数读取
  const arg = process.env.WORKFLOW_STATE || '';
  await app.runFilter(arg);
}

main();

