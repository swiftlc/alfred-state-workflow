<template>
  <div class="flex flex-col overflow-hidden" style="height:100%">

    <!-- ── 顶栏 ── -->
    <div
      class="flex items-center px-3 shrink-0 bg-white border-b border-slate-100"
      style="height:44px;gap:8px;box-shadow:0 1px 4px rgba(30,41,80,0.06)"
    >
      <!-- 返回 -->
      <button
        class="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-slate-400
               hover:text-indigo-500 hover:bg-indigo-50 text-[12.5px] font-medium
               transition-all cursor-pointer outline-none bg-transparent border-0"
        @click="goBack"
      >
        <component :is="ChevronLeft" :size="14" />
        返回
      </button>

      <div class="w-px h-4 bg-slate-100 shrink-0" />

      <!-- 页面名称 + 未保存圆点 -->
      <div class="flex items-center gap-1.5 min-w-0">
        <InlineEdit
          :value="pageName"
          display-style="font-size:13px;font-weight:600;color:#374151;max-width:220px"
          input-style="font-size:13px;font-weight:600;color:#374151;max-width:220px"
          @confirm="doRename"
        />
        <transition name="dot-fade">
          <span
            v-if="isDirty"
            class="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"
            title="有未保存的修改"
          />
        </transition>
      </div>

      <div class="flex-1" />

      <!-- 操作按钮 -->
      <div class="flex items-center gap-1.5 shrink-0">
        <n-button size="small" ghost @click="reloadKey++" title="重载预览">
          <template #icon><component :is="RotateCcw" :size="13" /></template>
        </n-button>

        <!-- ✦ 全屏预览 -->
        <n-button size="small" ghost @click="playing = true" title="全屏演示 (⌘P)">
          <template #icon><component :is="Maximize2" :size="13" /></template>
          全屏
        </n-button>

        <!-- ✦ 保存按钮：autosaving 静默灰色，saved 变绿 -->
        <n-button
          size="small"
          :type="saveState === 'saved' || saveState === 'autosaving' ? 'default' : isDirty && saveState === 'idle' ? 'primary' : 'default'"
          :loading="saveState === 'saving'"
          style="min-width:72px;transition:color 0.2s,border-color 0.2s"
          :style="saveState === 'saved' || saveState === 'autosaving' ? 'color:#10b981;border-color:#6ee7b7' : ''"
          title="⌘S"
          @click="doSave(false)"
        >
          {{ saveState === 'saved' || saveState === 'autosaving' ? '✓ 已保存' : '保存' }}
        </n-button>
      </div>
    </div>

    <!-- ── 主编辑区 ── -->
    <div
      ref="editorAreaRef"
      class="flex flex-1 min-h-0 overflow-hidden"
      @mousemove="onResizeMove"
      @mouseup="stopResize"
      @mouseleave="stopResize"
    >
      <!-- 左：Monaco -->
      <div
        class="flex flex-col min-w-0 overflow-hidden bg-white"
        :style="{ width: leftPct + '%' }"
      >
        <LcMonacoEditor
          v-model="editorCode"
          language="html"
          height="100%"
          context="playground"
          @cursor-change="onCursorChange"
        />
      </div>

      <!-- 拖拽把手（双击重置 50%） -->
      <div
        class="shrink-0 group flex items-center justify-center select-none"
        style="width:6px;background:#e2e8f0;cursor:col-resize;transition:background 0.15s"
        :style="{ background: isResizing ? '#a5adde' : '' }"
        title="双击重置 50%"
        @mousedown.prevent="startResize"
        @dblclick.prevent="leftPct = 50"
      >
        <div
          class="w-px h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style="background:#94a3b8"
        />
      </div>

      <!-- 右：实时预览 -->
      <div class="flex-1 min-w-0 overflow-hidden relative">
        <!-- resize 期间遮罩 -->
        <div v-if="isResizing" class="absolute inset-0 z-20 cursor-col-resize" />

        <!-- 预览刷新 loading bar -->
        <div
          class="absolute top-0 left-0 right-0 h-0.5 z-10 overflow-hidden"
          style="pointer-events:none"
        >
          <div
            v-if="previewRefreshing"
            class="h-full bg-indigo-400 rounded-full"
            style="animation: preview-sweep 0.6s ease-out forwards"
          />
        </div>

        <!-- ✦ 预览内容：轻微淡入避免白屏感 -->
        <transition name="preview-fade">
          <PlaygroundIframe :key="reloadKey" :html="previewHtml" class="w-full h-full" />
        </transition>
      </div>
    </div>

    <!-- ── 底部 Status Bar ── -->
    <div
      class="flex items-center px-3 shrink-0 border-t border-slate-100 text-[11px] text-slate-400 select-none"
      style="height:22px;background:#f8fafc;gap:12px"
    >
      <!-- ✦ 光标位置：等宽字体 -->
      <span class="font-mono">Ln {{ cursorPos.line }}, Col {{ cursorPos.col }}</span>
      <span class="w-px h-3 bg-slate-200" />
      <!-- 语言 -->
      <span>HTML</span>
      <!-- ✦ $ctx 摘要 -->
      <template v-if="ctxSummary">
        <span class="w-px h-3 bg-slate-200" />
        <span class="font-mono truncate max-w-xs opacity-70" title="当前 Alfred 上下文（$ctx() 可获取）">
          {{ ctxSummary }}
        </span>
      </template>
      <div class="flex-1" />
      <!-- 快捷键提示 -->
      <span class="opacity-60">⌘S 保存 &nbsp;·&nbsp; 双击把手重置比例</span>
    </div>

    <!-- ── 全屏演示 Overlay ── -->
    <teleport to="body">
      <div v-if="playing" class="fixed inset-0 z-50 bg-white flex flex-col">
        <!-- 顶栏 -->
        <div
          class="flex items-center px-3 shrink-0 bg-white border-b border-slate-100"
          style="height:44px;gap:8px;box-shadow:0 1px 4px rgba(30,41,80,0.06)"
        >
          <button
            class="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-slate-400
                   hover:text-indigo-500 hover:bg-indigo-50 text-[12.5px] font-medium
                   transition-all cursor-pointer outline-none bg-transparent border-0"
            @click="playing = false"
          >
            <component :is="ChevronLeft" :size="14" />
            退出演示
          </button>
          <div class="w-px h-4 bg-slate-100 shrink-0" />
          <span class="text-[13px] font-semibold text-slate-700 truncate">{{ pageName }}</span>
          <div class="flex-1" />
          <n-button size="small" ghost title="重载" @click="playReloadKey++">
            <template #icon><component :is="RotateCcw" :size="13" /></template>
          </n-button>
        </div>
        <!-- iframe 全屏（使用最新 previewHtml） -->
        <div class="flex-1 min-h-0">
          <PlaygroundIframe :key="playReloadKey" :html="editorCode" class="w-full h-full" />
        </div>
      </div>
    </teleport>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, useDialog } from 'naive-ui'
import { ChevronLeft, RotateCcw, Maximize2 } from '@lucide/vue'
import { usePlayground } from '@/composables/usePlayground'
import { getContext } from '@/api/alfred'
import PlaygroundIframe  from '@/components/playground/PlaygroundIframe.vue'
import LcMonacoEditor    from '@/components/lowcode/LcMonacoEditor.vue'
import InlineEdit        from '@/components/InlineEdit.vue'

defineOptions({ name: 'PlaygroundEditorView' })

const route  = useRoute()
const router = useRouter()

const dialog = useDialog()
const { pages, getPage, savePage, renamePage } = usePlayground()

// ── 页面数据 ────────────────────────────────────────────────────────────────────
const pageId   = computed(() => route.params.id as string)
const pageName = computed(() => pages.value.find(p => p.id === pageId.value)?.name ?? '')

const editorCode = ref('')
const savedHtml  = ref('')

onMounted(() => {
  const p = getPage(pageId.value)
  if (!p) { router.replace('/playground'); return }
  editorCode.value  = p.html
  savedHtml.value   = p.html
  previewHtml.value = p.html
  loadCtxSummary()
})

// ── 未保存状态 ─────────────────────────────────────────────────────────────────
const isDirty = computed(() => editorCode.value !== savedHtml.value)

// ── 保存（手动 + 自动） ────────────────────────────────────────────────────────
type SaveState = 'idle' | 'autosaving' | 'saving' | 'saved'
const saveState = ref<SaveState>('idle')
let saveTimer:     ReturnType<typeof setTimeout> | null = null
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function doSave(silent = false) {
  if (saveState.value === 'saving') return
  const p = pages.value.find(pg => pg.id === pageId.value)
  if (!p) return
  saveState.value = silent ? 'autosaving' : 'saving'
  savePage({ ...p, html: editorCode.value })
  savedHtml.value = editorCode.value
  saveState.value = 'saved'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveState.value = 'idle' }, 1500)
}

function doRename(name: string) {
  if (name.trim()) renamePage(pageId.value, name.trim())
}

// ── 离开确认（Naive UI dialog） ────────────────────────────────────────────────
function goBack() {
  if (!isDirty.value) { router.push('/playground'); return }
  dialog.warning({
    title:        '有未保存的修改',
    content:      '离开将丢失当前编辑内容，确认离开？',
    positiveText: '不保存，直接离开',
    negativeText: '取消',
    onPositiveClick: () => router.push('/playground'),
  })
}

// ── $ctx 摘要（status bar 显示当前上下文变量） ────────────────────────────────
const ctxSummary = ref('')
async function loadCtxSummary() {
  try {
    const ctx = await getContext()
    if (!ctx?.data) return
    const d = ctx.data as Record<string, { id?: string; name?: string }>
    const parts: string[] = []
    if (d.tenant)   parts.push(`租户 ${d.tenant.name ?? d.tenant.id ?? ''}`)
    if (d.swimlane) parts.push(`泳道 ${d.swimlane.id ?? ''}`)
    if (d.appkey)   parts.push(`${d.appkey.id ?? ''}`)
    ctxSummary.value = parts.join(' · ')
  } catch { /* 无上下文时静默 */ }
}

// ── Cmd+S ──────────────────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); doSave() }
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') { e.preventDefault(); playing.value = !playing.value }
  if (e.key === 'Escape' && playing.value) playing.value = false
}
onMounted(()   => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (saveTimer)     clearTimeout(saveTimer)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (previewTimer)  clearTimeout(previewTimer)
  if (refreshTimer)  clearTimeout(refreshTimer)
})

// ── 实时预览 + loading bar ─────────────────────────────────────────────────────
const previewHtml      = ref('')
const reloadKey        = ref(0)
const previewRefreshing = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

watch(editorCode, (val) => {
  // 500ms 实时预览
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    previewHtml.value = val
    reloadKey.value++
    previewRefreshing.value = false
    requestAnimationFrame(() => {
      previewRefreshing.value = true
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => { previewRefreshing.value = false }, 700)
    })
  }, 500)

  // ✦ 2s 自动保存（停止输入后静默保存）
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => { if (isDirty.value) doSave(true) }, 2000)
})

// ── 拖拽调宽 ──────────────────────────────────────────────────────────────────
const editorAreaRef = ref<HTMLElement | null>(null)
const leftPct       = ref(50)
const isResizing    = ref(false)
let startX   = 0
let startPct = 0

function startResize(e: MouseEvent) {
  isResizing.value = true
  startX   = e.clientX
  startPct = leftPct.value
}

function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return
  const w = editorAreaRef.value?.getBoundingClientRect().width ?? window.innerWidth
  const delta = ((e.clientX - startX) / w) * 100
  leftPct.value = Math.min(80, Math.max(20, startPct + delta))
}

function stopResize() { isResizing.value = false }

// ── 光标位置 ──────────────────────────────────────────────────────────────────
const cursorPos = reactive({ line: 1, col: 1 })
function onCursorChange(pos: { line: number; col: number }) {
  cursorPos.line = pos.line
  cursorPos.col  = pos.col
}

// ── 全屏演示 ──────────────────────────────────────────────────────────────────
const playing      = ref(false)
const playReloadKey = ref(0)
</script>

<style scoped>
.dot-fade-enter-active,
.dot-fade-leave-active { transition: opacity 0.25s }
.dot-fade-enter-from,
.dot-fade-leave-to    { opacity: 0 }

@keyframes preview-sweep {
  0%   { width: 0%;   opacity: 1 }
  70%  { width: 85%;  opacity: 1 }
  100% { width: 100%; opacity: 0 }
}

/* ✦ 预览内容切换：淡入，避免白屏感 */
.preview-fade-enter-active { transition: opacity 0.18s ease }
.preview-fade-enter-from   { opacity: 0 }
/* leave 不需要动画（直接切换 key） */
.preview-fade-leave-active { display: none }
</style>
