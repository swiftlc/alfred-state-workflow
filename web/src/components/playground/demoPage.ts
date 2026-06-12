/** 演示用 Playground Page HTML，展示 $sql 查询、变量渲染、按钮交互 */
export const DEMO_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SQL 查询演示</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; }
    .btn { transition: all .1s; }
    .btn:active { transform: scale(.96); }
    .spin { animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body class="bg-gray-50 min-h-screen p-6">

  <!-- 标题栏 -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-xl font-bold text-slate-800">Playground 演示</h1>
      <p class="text-sm text-slate-400 mt-0.5">展示 $sql 查询 · 变量绑定 · 按钮交互</p>
    </div>
    <span id="status" class="text-xs text-slate-400"></span>
  </div>

  <!-- SQL 输入区 -->
  <div class="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
    <label class="block text-xs font-medium text-slate-500 mb-2">SQL 查询</label>
    <div class="flex gap-2">
      <textarea
        id="sqlInput"
        rows="3"
        class="flex-1 font-mono text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-300 resize-none bg-slate-50"
        placeholder="SELECT 1 as id, 'hello' as name"
      >SELECT 1 as id, 'Alfred' as name, NOW() as ts
UNION SELECT 2, 'Console', NOW()
UNION SELECT 3, 'Demo', NOW()</textarea>
      <button
        id="runBtn"
        class="btn flex-shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-5 rounded-lg self-stretch"
        onclick="runQuery()"
      >执行</button>
    </div>
  </div>

  <!-- 结果区 -->
  <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
      <span class="text-xs font-medium text-slate-500">查询结果</span>
      <span id="rowCount" class="text-xs text-slate-400"></span>
    </div>
    <div id="resultArea" class="p-4 min-h-[120px]">
      <p class="text-sm text-slate-300 text-center mt-8">点击「执行」查看结果</p>
    </div>
  </div>

  <!-- 变量状态卡片 -->
  <div class="mt-4 grid grid-cols-3 gap-3" id="statsCards"></div>

  <script>
    const statusEl   = document.getElementById('status')
    const resultArea = document.getElementById('resultArea')
    const rowCount   = document.getElementById('rowCount')
    const statsCards = document.getElementById('statsCards')

    function setStatus(msg, color) {
      statusEl.textContent = msg
      statusEl.className = 'text-xs ' + (color || 'text-slate-400')
    }

    function renderTable(rows) {
      if (!rows || !rows.length) {
        resultArea.innerHTML = '<p class="text-sm text-slate-300 text-center mt-8">查询返回 0 行</p>'
        rowCount.textContent = '0 行'
        return
      }
      const cols = Object.keys(rows[0])
      const th = cols.map(c => \`<th class="text-left px-3 py-2 text-xs font-medium text-slate-500 bg-slate-50 border-b border-slate-100 whitespace-nowrap">\${c}</th>\`).join('')
      const trs = rows.map(row =>
        '<tr class="hover:bg-slate-50/60">' +
        cols.map(c => \`<td class="px-3 py-2 text-xs font-mono text-slate-600 border-b border-slate-50 whitespace-nowrap">\${row[c] ?? '—'}</td>\`).join('') +
        '</tr>'
      ).join('')
      resultArea.innerHTML = \`<div class="overflow-auto"><table class="w-full border-collapse"><thead><tr>\${th}</tr></thead><tbody>\${trs}</tbody></table></div>\`
      rowCount.textContent = rows.length + ' 行'

      // 渲染统计卡片（取前 3 列的第 1 行作为样例）
      statsCards.innerHTML = cols.slice(0, 3).map(col => \`
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div class="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">\${col}</div>
          <div class="text-lg font-semibold text-slate-700">\${rows[0][col] ?? '—'}</div>
        </div>
      \`).join('')
    }

    async function runQuery() {
      const sql = document.getElementById('sqlInput').value.trim()
      if (!sql) return
      const btn = document.getElementById('runBtn')
      btn.innerHTML = '<span class="spin inline-block">↻</span>'
      btn.disabled = true
      setStatus('执行中…', 'text-indigo-400')
      try {
        const rows = await $sql(sql)
        renderTable(Array.isArray(rows) ? rows : [])
        setStatus('执行成功 ✓', 'text-green-500')
      } catch (e) {
        resultArea.innerHTML = \`<p class="text-sm text-red-500 font-mono px-2">\${e.message}</p>\`
        setStatus('执行失败', 'text-red-400')
      } finally {
        btn.textContent = '执行'
        btn.disabled = false
      }
    }

    // 页面加载时自动执行一次
    runQuery()
  <\/script>
</body>
</html>`

export const DEMO_PAGE_NAME = 'SQL 查询演示'
export const DEMO_PAGE_PROMPT = '展示 $sql 查询、结果渲染为表格和统计卡片、用户可输入自定义 SQL 并执行'
