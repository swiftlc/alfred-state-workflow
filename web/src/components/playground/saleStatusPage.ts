export const SALE_STATUS_PAGE_NAME = 'SKU/SPU 上下架管理'
export const SALE_STATUS_PAGE_PROMPT = '展示 SPU/SKU 上下架状态树形结构，支持按渠道修改 sale_status，基于 diff 批量更新'

export const SALE_STATUS_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SKU/SPU 上下架管理</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif; background:#f8fafc; }
  .btn { transition:all .1s; cursor:pointer; }
  .btn:active { transform:scale(.95); }
  .spin { display:inline-block; animation:spin .7s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  select { appearance:auto; }
  .badge { display:inline-flex; align-items:center; padding:1px 7px; border-radius:9999px; font-size:11px; font-weight:600; white-space:nowrap; }
  .badge-up   { background:#dcfce7; color:#166534; }
  .badge-down { background:#fee2e2; color:#991b1b; }
  .badge-sold { background:#fef9c3; color:#854d0e; }
  .changed { background:#fef9c3 !important; }
  .tree-line { border-left:2px solid #e2e8f0; margin-left:12px; padding-left:16px; }
  .spu-card { background:white; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.05); }
  .sku-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-top:8px; }
  .channel-row { display:flex; align-items:center; gap:8px; padding:4px 0; }
  .ch-label { font-size:11px; color:#64748b; font-weight:500; min-width:60px; }
  .ch-select { font-size:12px; border:1px solid #e2e8f0; border-radius:6px; padding:2px 6px; background:#fff; outline:none; }
  .ch-select:focus { border-color:#818cf8; }
  .section-title { font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
  .diff-badge { font-size:10px; background:#fef3c7; color:#b45309; border:1px solid #fcd34d; border-radius:4px; padding:1px 5px; margin-left:4px; }
  .toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#1e293b; color:#fff; padding:8px 18px; border-radius:8px; font-size:13px; z-index:999; opacity:0; transition:opacity .2s; pointer-events:none; }
  .toast.show { opacity:1; }
</style>
</head>
<body class="p-5">

<div class="toast" id="toast"></div>

<!-- 顶部 -->
<div class="flex items-center justify-between mb-5">
  <div>
    <h1 class="text-lg font-bold text-slate-800">SKU/SPU 上下架管理</h1>
    <p class="text-xs text-slate-400 mt-0.5">merchant_id: 1000338 · poi_id: 49870430</p>
  </div>
  <div class="flex items-center gap-2">
    <button id="refreshBtn" class="btn text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50" onclick="loadData()">↻ 刷新</button>
    <button id="saveBtn" class="btn text-xs text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-4 py-1.5 hidden" onclick="saveChanges()">保存修改</button>
    <span id="diffCount" class="text-xs text-amber-600 hidden"></span>
  </div>
</div>

<!-- loading -->
<div id="loadingEl" class="text-center py-16 text-slate-300">
  <div class="spin text-2xl mb-2">↻</div>
  <div class="text-sm">加载中…</div>
</div>

<!-- 错误 -->
<div id="errorEl" class="hidden bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4"></div>

<!-- 树形内容 -->
<div id="treeEl" class="hidden"></div>

<script>
// ──────────────────────── 配置 ────────────────────────
const CFG = {
  merchantId: '1000338',
  poiId: '49870430',
  skuIds: ['2064633193247629335','2063966223783256069'],
  spuIds: ['2064633193184702465','2063966223661621332'],
  channels: [100, 200, 0],
  // sku → spu 映射
  skuToSpu: {
    '2064633193247629335': '2064633193184702465',
    '2063966223783256069': '2063966223661621332',
  }
}

const CH_NAME = { 100: '外卖', 200: '团购', 0: '通用' }
const STATUS_LABEL = { 1: '上架', 2: '下架', 3: '售罄下架' }
const STATUS_CLASS = { 1: 'badge-up', 2: 'badge-down', 3: 'badge-sold' }

// ──────────────────────── 状态 ────────────────────────
let originalData = {}  // { 'spu_{id}_{ch}': {id, status}, 'sku_{id}_{ch}': {id, status} }
let currentData  = {}  // 当前编辑中的值（深拷贝）
let spuRows = [], skuRows = [], onlineRows = []

// ──────────────────────── 加载 ────────────────────────
async function loadData() {
  show('loadingEl'); hide('treeEl'); hide('errorEl')
  try {
    const skuIn = CFG.skuIds.map(s => "'" + s + "'").join(',')
    const spuIn = CFG.spuIds.map(s => "'" + s + "'").join(',')
    const ch    = CFG.channels.join(',')
    const [sk, sp, ol] = await Promise.all([
      $sql("select id,sku_id,channel_id,sale_status from dim_sku_channel_info where merchant_id=" + CFG.merchantId + " and dim_id=" + CFG.poiId + " and sku_id in (" + skuIn + ") and sale_status is not null and valid=1 and channel_id in (" + ch + ") order by sku_id asc,spu_id"),
      $sql("select id,spu_id,channel_id,sale_status from dim_spu_channel_info where merchant_id=" + CFG.merchantId + " and dim_id=" + CFG.poiId + " and spu_id in (" + spuIn + ") and valid=1 and sale_status is not null and channel_id in (" + ch + ") order by spu_id asc"),
      $sql("select id,spu_id,pv from poi_spu_online_info where merchant_id=" + CFG.merchantId + " and poi_id=" + CFG.poiId + " and spu_id in (" + spuIn + ") and valid=1"),
    ])
    skuRows    = Array.isArray(sk) ? sk : []
    spuRows    = Array.isArray(sp) ? sp : []
    onlineRows = Array.isArray(ol) ? ol : []
    buildState()
    render()
    hide('loadingEl'); show('treeEl')
  } catch(e) {
    hide('loadingEl')
    const el = document.getElementById('errorEl')
    el.textContent = '加载失败：' + e.message
    el.classList.remove('hidden')
  }
}

// ──────────────────────── 构建状态 ────────────────────────
function buildState() {
  originalData = {}
  // SPU
  spuRows.forEach(r => {
    originalData['spu_' + r.spu_id + '_' + r.channel_id] = { id: r.id, status: Number(r.sale_status) }
  })
  // SKU
  skuRows.forEach(r => {
    originalData['sku_' + r.sku_id + '_' + r.channel_id] = { id: r.id, status: Number(r.sale_status) }
  })
  // online pv 里的 channelAutoOnShelf
  onlineRows.forEach(r => {
    try {
      const pv = typeof r.pv === 'string' ? JSON.parse(r.pv) : r.pv
      if (pv && pv.channelAutoOnShelf) {
        Object.entries(pv.channelAutoOnShelf).forEach(([ch, val]) => {
          originalData['pv_' + r.spu_id + '_autoShelf_' + ch] = { id: r.id, status: val, pvField: 'channelAutoOnShelf', ch }
        })
      }
    } catch(e) {}
  })
  currentData = JSON.parse(JSON.stringify(originalData))
}

// ──────────────────────── 计算 diff ────────────────────────
function getDiff() {
  const diff = []
  Object.keys(currentData).forEach(k => {
    const orig = originalData[k]
    const cur  = currentData[k]
    if (orig && cur && orig.status !== cur.status) {
      diff.push({ key: k, orig, cur })
    }
  })
  return diff
}

function updateDiffUI() {
  const diff = getDiff()
  const saveBtn  = document.getElementById('saveBtn')
  const diffCount = document.getElementById('diffCount')
  if (diff.length > 0) {
    saveBtn.classList.remove('hidden')
    diffCount.classList.remove('hidden')
    diffCount.textContent = diff.length + ' 处变更'
  } else {
    saveBtn.classList.add('hidden')
    diffCount.classList.add('hidden')
  }
}

// ──────────────────────── 渲染 ────────────────────────
function render() {
  const el = document.getElementById('treeEl')
  // 按 spu 分组
  const spuGroups = {}
  CFG.spuIds.forEach(sid => { spuGroups[sid] = { spuId: sid, skus: [] } })
  CFG.skuIds.forEach(kid => {
    const sid = CFG.skuToSpu[kid]
    if (sid && spuGroups[sid]) spuGroups[sid].skus.push(kid)
  })

  el.innerHTML = Object.values(spuGroups).map(g => renderSpuCard(g)).join('')
}

function statusBadge(status) {
  const cls = STATUS_CLASS[status] || ''
  return '<span class="badge ' + cls + '">' + (STATUS_LABEL[status] || status) + '</span>'
}

function changedMark(key) {
  const orig = originalData[key]
  const cur  = currentData[key]
  if (orig && cur && orig.status !== cur.status) {
    return '<span class="diff-badge">已改 ' + STATUS_LABEL[orig.status] + ' → ' + STATUS_LABEL[cur.status] + '</span>'
  }
  return ''
}

function renderChannelSelects(prefix, entityId, label) {
  return CFG.channels.map(ch => {
    const key = prefix + '_' + entityId + '_' + ch
    const d   = currentData[key]
    if (!d) return ''
    const changed = originalData[key] && d.status !== originalData[key].status
    return '<div class="channel-row">' +
      '<span class="ch-label">' + (CH_NAME[ch] || ('ch' + ch)) + ' (ch' + ch + ')</span>' +
      '<select class="ch-select' + (changed ? ' changed' : '') + '" onchange="onStatusChange(\'' + key + '\', this.value)">' +
        [1,2,3].map(s => '<option value="' + s + '"' + (d.status == s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>').join('') +
      '</select>' +
      (changed ? '<span class="diff-badge">改' + STATUS_LABEL[originalData[key].status] + '→' + STATUS_LABEL[d.status] + '</span>' : '') +
    '</div>'
  }).join('')
}

function renderSpuCard(g) {
  const sid = g.spuId
  const onlineRow = onlineRows.find(r => String(r.spu_id) === String(sid))
  let pvSection = ''
  if (onlineRow) {
    try {
      const pv = typeof onlineRow.pv === 'string' ? JSON.parse(onlineRow.pv) : onlineRow.pv
      if (pv && pv.channelAutoOnShelf) {
        const entries = Object.entries(pv.channelAutoOnShelf)
        pvSection = '<div class="mt-3"><div class="section-title">自动上架开关 (channelAutoOnShelf)</div>' +
          entries.map(([ch, val]) => {
            const key = 'pv_' + sid + '_autoShelf_' + ch
            const cur = currentData[key]
            const changed = cur && originalData[key] && cur.status !== originalData[key].status
            return '<div class="channel-row">' +
              '<span class="ch-label">ch' + ch + '</span>' +
              '<select class="ch-select' + (changed ? ' changed' : '') + '" onchange="onStatusChange(\'' + key + '\', this.value)">' +
                [0,1].map(v => '<option value="' + v + '"' + (String(cur ? cur.status : val) === String(v) ? ' selected' : '') + '>' + (v ? '开' : '关') + '</option>').join('') +
              '</select>' +
              (changed ? '<span class="diff-badge">已改</span>' : '') +
            '</div>'
          }).join('') +
        '</div>'
      }
    } catch(e) {}
  }

  const skuSection = g.skus.map(kid => {
    return '<div class="sku-card">' +
      '<div class="flex items-center justify-between mb-2">' +
        '<div>' +
          '<span class="text-xs font-medium text-slate-600">SKU</span>' +
          '<span class="ml-2 font-mono text-xs text-indigo-500">' + kid + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="section-title">上下架状态</div>' +
      renderChannelSelects('sku', kid, 'SKU') +
    '</div>'
  }).join('')

  return '<div class="spu-card">' +
    '<div class="flex items-center justify-between mb-3">' +
      '<div>' +
        '<span class="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">SPU</span>' +
        '<span class="ml-2 font-mono text-sm font-semibold text-slate-700">' + sid + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="section-title">SPU 上下架状态</div>' +
    renderChannelSelects('spu', sid, 'SPU') +
    pvSection +
    (skuSection ? '<div class="tree-line mt-4"><div class="section-title mb-2">所属 SKU</div>' + skuSection + '</div>' : '') +
  '</div>'
}

// ──────────────────────── 交互 ────────────────────────
function onStatusChange(key, val) {
  if (currentData[key]) {
    currentData[key] = { ...currentData[key], status: Number(val) }
  }
  updateDiffUI()
  // 局部更新 select 样式
  document.querySelectorAll('select').forEach(sel => {
    const k = sel.getAttribute('onchange')?.match(/'([^']+)'/)?.[1]
    if (k && currentData[k] && originalData[k]) {
      if (currentData[k].status !== originalData[k].status) sel.classList.add('changed')
      else sel.classList.remove('changed')
    }
  })
}

// ──────────────────────── 保存 ────────────────────────
async function saveChanges() {
  const diff = getDiff()
  if (!diff.length) return

  const btn = document.getElementById('saveBtn')
  btn.innerHTML = '<span class="spin">↻</span> 保存中…'
  btn.disabled = true

  const errors = []
  const successes = []

  for (const d of diff) {
    try {
      const cur = d.cur
      if (d.key.startsWith('spu_')) {
        // SPU sale_status 更新
        await $sql(
          "update dim_spu_channel_info set sale_status=" + cur.status +
          " where id=" + cur.id + " limit 1"
        )
        successes.push('SPU ch' + d.key.split('_')[2] + ': ' + STATUS_LABEL[d.orig.status] + '→' + STATUS_LABEL[cur.status])
      } else if (d.key.startsWith('sku_')) {
        // SKU sale_status 更新
        await $sql(
          "update dim_sku_channel_info set sale_status=" + cur.status +
          " where id=" + cur.id + " limit 1"
        )
        successes.push('SKU ch' + d.key.split('_')[2] + ': ' + STATUS_LABEL[d.orig.status] + '→' + STATUS_LABEL[cur.status])
      } else if (d.key.startsWith('pv_')) {
        // pv JSON 字段更新 - 需要先读再改写
        const parts  = d.key.split('_')  // pv_{spuId}_autoShelf_{ch}
        const spuId  = parts[1]
        const field  = parts[2]  // autoShelf
        const ch     = parts[3]
        const row    = onlineRows.find(r => String(r.spu_id) === String(spuId))
        if (row) {
          const pv = typeof row.pv === 'string' ? JSON.parse(row.pv) : { ...row.pv }
          if (!pv.channelAutoOnShelf) pv.channelAutoOnShelf = {}
          pv.channelAutoOnShelf[ch] = cur.status
          const pvStr = JSON.stringify(pv).replace(/'/g, "\\\\'")
          await $sql(
            "update poi_spu_online_info set pv='" + pvStr + "' where id=" + cur.id + " limit 1"
          )
          successes.push('SPU pv.channelAutoOnShelf[' + ch + ']: ' + d.orig.status + '→' + cur.status)
        }
      }
    } catch(e) {
      errors.push(d.key + ': ' + e.message)
    }
  }

  btn.textContent = '保存修改'
  btn.disabled = false

  if (errors.length) {
    showToast('⚠ 部分失败：' + errors[0], 4000)
  } else {
    showToast('✓ 已保存 ' + successes.length + ' 处变更', 2000)
    // 刷新数据
    await loadData()
  }
}

function showToast(msg, ms) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), ms || 2000)
}

function show(id) { document.getElementById(id).classList.remove('hidden') }
function hide(id) { document.getElementById(id).classList.add('hidden') }

// 初始加载
loadData()
<\/script>
</body>
</html>`
