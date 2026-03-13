import app from './app';

async function main(): Promise<void> {
  // 优先从环境变量读取，如果没有则尝试从命令行参数读取
  const arg = process.env['alfred_workflow_arg'] ?? process.argv[2] ?? '';
  await app.runAction(arg);
}

main().catch(console.error);

