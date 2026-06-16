<template>
  <div class="relative w-full h-full bg-white">
    <!-- 加载中 -->
    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-white z-10"
    >
      <n-spin size="medium" />
    </div>

    <!-- 错误提示 -->
    <div
      v-if="lastError"
      class="absolute bottom-3 left-3 right-3 z-20 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 font-mono flex items-start gap-2"
    >
      <span class="flex-shrink-0 font-bold">错误</span>
      <span class="flex-1 break-all">{{ lastError }}</span>
      <button class="flex-shrink-0 text-red-400 hover:text-red-600" @click="lastError = ''">✕</button>
    </div>

    <iframe
      ref="iframeRef"
      class="w-full h-full border-none"
      :srcdoc="injectedHtml"
      sandbox="allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
      @load="onLoad"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { NSpin } from 'naive-ui'

const props = defineProps<{ html: string }>()
const emit  = defineEmits<{ error: [msg: string] }>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const loading   = ref(true)
const lastError = ref('')

// ─── 注入桥接脚本 ──────────────────────────────────────────────────────────────

// 注入到 HTML head 里的脚本，让页面可以直接调用 $sql / $http
const BRIDGE_SCRIPT = `
<script>
(function() {
  let _reqId = 0
  const _pending = {}

  window.addEventListener('message', function(e) {
    const d = e.data
    if (!d || !d.__pg_resp) return
    const cb = _pending[d.id]
    if (cb) {
      delete _pending[d.id]
      if (d.error) cb.reject(new Error(d.error))
      else cb.resolve(d.data)
    }
  })

  function _call(type, payload) {
    return new Promise(function(resolve, reject) {
      const id = '__pg_' + (++_reqId)
      _pending[id] = { resolve, reject }
      window.parent.postMessage({ __pg_req: true, type, id, ...payload }, '*')
      // 超时 30s
      setTimeout(function() {
        if (_pending[id]) {
          delete _pending[id]
          reject(new Error(type + ' 请求超时'))
        }
      }, 30000)
    })
  }

  window.$sql     = function(query)        { return _call('sql',  { query }) }
  window.$http    = function(url, options) { return _call('http', { url, options: options || {} }) }
  window.$octo    = function(body)         { return _call('octo', { body }) }
  window.$openUrl = function(url)          { return _call('openUrl', { url }) }
  window.$ctx     = function() { return _call('ctx', {}) }
  window.$pg      = { sql: window.$sql, http: window.$http, octo: window.$octo, openUrl: window.$openUrl, ctx: window.$ctx }
})()
<\/script>
`

const injectedHtml = computed(() => {
  if (!props.html) return ''
  // 注入到 <head> 第一个位置，没有 head 则直接前置
  const headMatch = props.html.match(/<head[^>]*>/i)
  if (headMatch) {
    return props.html.replace(headMatch[0], headMatch[0] + BRIDGE_SCRIPT)
  }
  return BRIDGE_SCRIPT + props.html
})

// ─── 消息桥接 ──────────────────────────────────────────────────────────────────

async function handleMessage(e: MessageEvent) {
  const d = e.data
  if (!d?.__pg_req) return
  if (e.source !== iframeRef.value?.contentWindow) return

  const { type, id } = d

  try {
    let result: unknown

    if (type === 'sql') {
      const res = await fetch('/api/sql', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ sql: d.query }),
      })
      const json = await res.json() as { code: number; data: unknown; error?: string }
      if (json.code !== 0) throw new Error(json.error ?? 'SQL 执行失败')
      result = json.data

    } else if (type === 'http') {
      // 本地 /api/* 路径直接 fetch，外部 URL 走 /proxy 转发
      const isLocal = d.url.startsWith('/api/') || d.url.startsWith('/internal') || d.url.startsWith('/rules') || d.url.startsWith('/dictionaries')
      const res = isLocal
        ? await fetch(d.url, {
            method:  d.options?.method ?? 'GET',
            headers: { 'content-type': 'application/json', ...(d.options?.headers ?? {}) },
            body:    d.options?.body ? JSON.stringify(d.options.body) : undefined,
          })
        : await fetch('/proxy', {
            method:  d.options?.method ?? 'GET',
            headers: { 'x-proxy-dest': d.url, 'content-type': 'application/json', ...(d.options?.headers ?? {}) },
            body:    d.options?.body ? JSON.stringify(d.options.body) : undefined,
          })
      result = await res.json()

    } else if (type === 'octo') {
      const res = await fetch('/api/octo-invoke', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(d.body),
      })
      result = await res.json()

    } else if (type === 'ctx') {
      const res  = await fetch('/internal/context')
      const json = await res.json() as { code: number; data: unknown }
      result = json.code === 0 ? json.data : null

    } else if (type === 'openUrl') {
      window.open(d.url, '_blank')
      result = { ok: true }

    } else {
      throw new Error(`未知请求类型: ${type}`)
    }

    iframeRef.value?.contentWindow?.postMessage({ __pg_resp: true, id, data: result }, '*')

  } catch (err) {
    const msg = (err as Error).message
    lastError.value = msg
    emit('error', msg)
    iframeRef.value?.contentWindow?.postMessage({ __pg_resp: true, id, error: msg }, '*')
  }
}

function onLoad() { loading.value = false }

// HTML 变化时重置 loading
watch(() => props.html, () => { loading.value = true; lastError.value = '' })

onMounted(()   => window.addEventListener('message', handleMessage))
onUnmounted(() => window.removeEventListener('message', handleMessage))
</script>
