<template>
  <div class="relative w-full h-full bg-white">
    <!-- 加载中 -->
    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-white z-10"
    >
      <n-spin size="medium" />
    </div>

    <!-- ✦ 错误提示（顶部居中，醒目，5s 自动消失） -->
    <transition name="err-slide">
      <div
        v-if="lastError"
        class="absolute top-3 left-4 right-4 z-30 flex items-start gap-2.5
               bg-red-600 text-white rounded-xl px-4 py-3 shadow-lg"
        style="font-size:12.5px;line-height:1.5"
      >
        <!-- 警告图标 -->
        <svg class="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <!-- 内容 -->
        <span class="flex-1 font-mono break-all opacity-95">{{ lastError }}</span>
        <!-- 倒计时 + 关闭 -->
        <div class="flex items-center gap-2 shrink-0">
          <span v-if="errorCountdown > 0" class="text-red-200 text-[11px] font-mono">{{ errorCountdown }}s</span>
          <button class="text-red-200 hover:text-white transition-colors leading-none" @click="dismissError">✕</button>
        </div>
      </div>
    </transition>

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

const iframeRef       = ref<HTMLIFrameElement | null>(null)
const loading         = ref(true)
const lastError       = ref('')
const errorCountdown  = ref(0)
let errorDismissTimer: ReturnType<typeof setTimeout>  | null = null
let errorCountTimer:   ReturnType<typeof setInterval> | null = null

function showError(msg: string) {
  lastError.value      = msg
  errorCountdown.value = 5
  if (errorDismissTimer) clearTimeout(errorDismissTimer)
  if (errorCountTimer)   clearInterval(errorCountTimer)
  errorDismissTimer = setTimeout(() => { lastError.value = ''; errorCountdown.value = 0 }, 5000)
  errorCountTimer   = setInterval(() => {
    errorCountdown.value = Math.max(0, errorCountdown.value - 1)
    if (errorCountdown.value === 0) { clearInterval(errorCountTimer!); errorCountTimer = null }
  }, 1000)
}

function dismissError() {
  lastError.value = ''
  errorCountdown.value = 0
  if (errorDismissTimer) { clearTimeout(errorDismissTimer);   errorDismissTimer = null }
  if (errorCountTimer)   { clearInterval(errorCountTimer);    errorCountTimer   = null }
}

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
    showError(msg)
    emit('error', msg)
    iframeRef.value?.contentWindow?.postMessage({ __pg_resp: true, id, error: msg }, '*')
  }
}

function onLoad() { loading.value = false }

// HTML 变化时重置 loading 和错误
watch(() => props.html, () => { loading.value = true; dismissError() })

onMounted(()   => window.addEventListener('message', handleMessage))
onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
  if (errorDismissTimer) clearTimeout(errorDismissTimer)
  if (errorCountTimer)   clearInterval(errorCountTimer)
})
</script>


<style scoped>
.err-slide-enter-active { transition: all 0.2s ease-out }
.err-slide-leave-active { transition: all 0.15s ease-in }
.err-slide-enter-from   { opacity: 0; transform: translateY(-8px) }
.err-slide-leave-to     { opacity: 0; transform: translateY(-8px) }
</style>
