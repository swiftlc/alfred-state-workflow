# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

这是一个 Alfred Workflow 框架，基于 TypeScript 构建，用于快速开发具备状态机、字典选择、后台任务、历史记录、工作区快照和快捷指令等能力的 Alfred 工作流。

## 常用命令

```bash
# 类型检查
pnpm typecheck

# 手动测试 filter（Script Filter 入口）
WORKFLOW_STATE="" pnpm filter <query>

# 手动测试 action（Run Script 入口）
alfred_workflow_arg=<encoded_context> pnpm action
```

## 架构概览

### 入口文件

- `src/filter.ts` — Alfred Script Filter 入口，读取 `WORKFLOW_STATE` 环境变量和命令行参数，调用 `app.runFilter()`
- `src/action.ts` — Alfred Run Script 入口，读取 `alfred_workflow_arg` 环境变量，调用 `app.runAction()`
- `src/worker.ts` — 后台任务 worker，由 `Workflow.startTask()` 用 `tsx` 作为子进程启动

### 核心层 (`src/core/`)

- **`Workflow.ts`** — 框架核心类，管理状态机（`onState`/`runFilter`）、动作（`onAction`/`runAction`）、后台任务（`onTask`/`startTask`）、上下文持久化（`data/context.json`，TTL 10 分钟）以及 Alfred External Trigger 触发（`triggerAlfred`）
- **`utils.ts`** — `encodeContext`/`decodeContext`（Base64 JSON 序列化），`openUrl`、`copyToClipboard`、`sendNotification` 等系统工具
- **`CacheManager.ts`** — 文件级缓存（`data/cache.json`），支持 TTL
- **`HistoryManager.ts`** — 历史记录持久化（`data/history.json`），支持固定/删除
- **`TaskManager.ts`** — 后台任务状态管理（`data/` 下按 jobId 存储任务文件）
- **`WorkspaceManager.ts`** — 工作区快照持久化（`data/workspaces.json`）
- **`AliasManager.ts`** — 快捷指令持久化（`data/aliases.json`）
- **`PluginManager.ts`** — 从 `data/plugins/` 动态加载 `.js`/`.json` 插件
- **`HttpClient.ts`** — axios 封装，提供 `http.get/post/put/proxy`（`proxy` 方法通过本地代理服务 `http://127.0.0.1:8080` 转发请求）
- **`Logger.ts`** — 文件日志（`data/app.log`）

### 配置层 (`src/config/`)

- **`features.ts`** — 功能矩阵，定义所有 `Feature` 对象（内置功能 + 插件功能合并导出）
- **`icons.ts`** — 图标路径常量

### 处理层 (`src/handlers/`)

- **`states.ts`** — 注册所有状态处理器（`home`、`progress`、`select_dict`、`input_state`、`history_manage`、`task_manage`、`workspace_manage`、`workspace_save`、`alias_manage`、`alias_save`）
- **`actions.ts`** — 注册所有动作处理器

### 服务层 (`src/services/`)

- **`dictService.ts`** — 字典数据服务，优先从本地代理 `http://127.0.0.1:8080` 获取，失败时降级到硬编码数据，结果通过 `CacheManager` 缓存

### 类型定义 (`src/types.ts`)

核心类型：`Context`（状态机上下文）、`Feature`（功能定义）、`AlfredItem`（Alfred 列表项）、`StateHandler`/`ActionHandler`/`TaskHandler`

## 关键设计模式

### Context 传递机制

`Context` 对象通过 `encodeContext`（Base64 JSON）序列化后作为 Alfred item 的 `arg` 字段传递。`filter` 阶段通过 `WORKFLOW_STATE` 环境变量接收，`action` 阶段通过 `alfred_workflow_arg` 接收。

### Feature 定义

在 `src/config/features.ts` 中添加 `Feature` 对象即可声明一个功能：
- `requiredKeys`：执行前必须在上下文中存在的字典 key
- `requiredInputs`：多步骤手动输入参数（支持 `fetchOptions` 动态候选、`skipIf` 跳过条件）
- `type: 'split_by_dict'`：对所有已选字典项各生成一个列表条目
- `actionHandler`：可直接在 Feature 内联定义，无需在 `actions.ts` 中注册

### 后台任务

调用 `wf.startTask(taskName, context)` 启动后台任务，框架会：
1. 生成唯一 `jobId`，用 `tsx` 启动独立 worker 进程
2. 自动跳转到 `progress` 状态，通过 `rerun: 0.2` 每 0.2 秒刷新进度
3. worker 通过 `TaskUpdater.update()` 更新进度，支持取消检测

### 插件系统

在 `data/plugins/` 目录下放置 `.js` 文件，导出符合 `Plugin` 类型的对象，即可动态注入 Feature 和 ActionHandler，无需修改核心代码。


### 约束

增加功能时，第一先考虑是否可以做成可配，方便feature快速配置集成，而不是针对某个name的feature做特别处理。
