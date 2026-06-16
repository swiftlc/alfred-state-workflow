# Playground 页面开发指南

每个 Playground 页面是一个**完整独立的 HTML 文件**，通过 iframe + postMessage bridge 运行在沙箱中。
页面可以直接调用以下全局 API，无需任何 import。

---

## 全局 API

### `await $sql(query)` → `Row[]`

执行 SQL 查询，返回结果行数组。

```html
<script>
(async () => {
  const rows = await $sql('SELECT id, name, status FROM orders LIMIT 20')
  // rows = [{ id: 1, name: 'foo', status: 'active' }, ...]
})()
</script>
```

### `await $http(url, options?)` → `any`

HTTP 请求。`/api/*` 本地直连，外部 URL 自动走代理转发。

```javascript
// GET 请求
const data = await $http('/api/alfred/dicts')

// POST 请求（外部 URL 走代理）
const result = await $http('https://example.com/api/query', {
  method: 'POST',
  body: { tenantId: 1234, page: 1 },   // body 自动 JSON.stringify
  headers: { 'X-Custom': 'value' },
})
```

### `await $octo(body)` → `any`

调用 Octo RPC 服务。

```javascript
const res = await $octo({
  appKey:       'com.sankuai.xxx',
  serviceName:  'com.xxx.SomeService',
  methodName:   'queryList',
  methodParams: [{ tenantId: 1234, page: 1, pageSize: 20 }],
})
```

### `await $ctx()` → `AlfredContext | null`

获取当前 Alfred 上下文（用户在 Alfred 里已选的字典数据）。

```javascript
const ctx = await $ctx()
// ctx 示例：
// {
//   state: 'home',
//   data: {
//     tenant:   { id: 't-001', name: '新供给测试租户 338' },
//     swimlane: { id: 'base', name: '基础泳道 (base)' },
//     appkey:   { id: 'com.sankuai.sgshop', name: 'com.sankuai.sgshop' },
//   }
// }

const tenantId  = ctx?.data?.tenant?.id
const swimlane  = ctx?.data?.swimlane?.id
const appkey    = ctx?.data?.appkey?.id
```

**常见字典 key：**

| key | 说明 | 常用字段 |
|-----|------|---------|
| `tenant` | 租户 | `id`（租户 ID）、`name` |
| `swimlane` | 泳道 | `id`（泳道 code）、`name` |
| `appkey` | 应用 key | `id`（appkey 字符串） |
| `mafka` | kafka 主题 | `id`、`value`（topic 名） |

### `$openUrl(url)` → `void`

在新标签页打开 URL。

```javascript
$openUrl('https://km.sankuai.com/page/xxxx')
```

### `$pg` — API 集合别名

```javascript
// 以下等价
await $pg.sql('SELECT 1')
await $pg.http('/api/xxx')
await $pg.ctx()
```

---

## 页面结构模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>页面标题</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen p-6">

  <!-- HTML 内容 -->

  <script>
  (async () => {
    // 页面逻辑写在 async IIFE 里，才能直接 await
  })()
  </script>
</body>
</html>
```

> **必须用 async IIFE** `(async () => { ... })()` 包裹 JS，才能在顶层使用 `await`。

---

## 样式规范

- 使用 **Tailwind CSS**（CDN 已内置：`https://cdn.tailwindcss.com`）
- 主色：`indigo-500`（`#5b6af0`）/ `indigo-600`
- 背景：`bg-gray-50` 或 `bg-slate-50`
- 卡片：`bg-white rounded-xl border border-slate-200 shadow-sm`
- 标题文字：`text-slate-800 font-semibold`
- 次级文字：`text-slate-500`
- 表格行悬停：`hover:bg-slate-50`

---

## 常用代码模式

### 带 loading 状态的查询

```javascript
async function query() {
  const btn = document.getElementById('runBtn')
  btn.disabled = true
  btn.textContent = '查询中…'
  try {
    const rows = await $sql('SELECT ...')
    renderTable(rows)
  } catch (e) {
    showError(e.message)
  } finally {
    btn.disabled = false
    btn.textContent = '查询'
  }
}
```

### 渲染数据表格

```javascript
function renderTable(rows) {
  if (!rows.length) { el.innerHTML = '<p class="text-slate-400 text-sm">暂无数据</p>'; return }
  const cols = Object.keys(rows[0])
  const thead = `<tr>${cols.map(c => `<th class="px-3 py-2 text-left text-xs font-medium text-slate-500 bg-slate-50 border-b">${c}</th>`).join('')}</tr>`
  const tbody = rows.map(r =>
    `<tr class="hover:bg-slate-50">${cols.map(c => `<td class="px-3 py-2 text-xs text-slate-700 border-b border-slate-50">${r[c] ?? '—'}</td>`).join('')}</tr>`
  ).join('')
  el.innerHTML = `<div class="overflow-auto"><table class="w-full border-collapse">${thead}${tbody}</table></div>`
}
```

### 注入上下文自动填充参数

```javascript
(async () => {
  const ctx = await $ctx()
  const tenantId = ctx?.data?.tenant?.id ?? ''
  const swimlane = ctx?.data?.swimlane?.id ?? 'base'

  // 自动填入表单
  document.getElementById('tenantInput').value = tenantId

  // 直接用于查询
  const rows = await $sql(`SELECT * FROM orders WHERE tenant_id = '${tenantId}' LIMIT 50`)
})()
```

### 分页查询

```javascript
let page = 1
const pageSize = 20

async function loadPage(p) {
  page = p
  const offset = (p - 1) * pageSize
  const rows = await $sql(`SELECT * FROM table LIMIT ${pageSize} OFFSET ${offset}`)
  renderTable(rows)
  updatePagination()
}
```

### 调用内部接口

```javascript
// 调用 Alfred API
const aliases = await $http('/api/alfred/aliases')
const dicts   = await $http('/api/alfred/dicts/tenant/items')

// 调用带参数的内部接口
const res = await $http('/api/qnh/login', {
  method: 'POST',
  body: { tenantId, swimlane },
})
```

---

## 错误处理规范

```javascript
// 在页面底部展示错误
function showError(msg) {
  const el = document.getElementById('errorBanner')
  if (!el) return
  el.textContent = msg
  el.className = 'fixed bottom-4 left-4 right-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600'
}

// HTML 中对应的 banner（默认隐藏）
// <div id="errorBanner" class="hidden"></div>
```

---

## 生成页面时的注意事项

1. **完整 HTML**：始终输出包含 `<!DOCTYPE html>` 的完整文档，不要省略
2. **API 调用写在 async IIFE 内**：所有 `await` 必须在 async 函数中
3. **上下文变量**：使用 `$ctx()` 获取当前租户/泳道，不要硬编码 ID
4. **错误处理**：所有 `$sql`/`$http` 调用都要加 try/catch
5. **loading 状态**：耗时操作要给用户视觉反馈（按钮 disabled、spinner）
6. **Tailwind only**：使用 Tailwind 类，不要写大段内联 style
7. **中文 UI**：所有展示文字使用中文
