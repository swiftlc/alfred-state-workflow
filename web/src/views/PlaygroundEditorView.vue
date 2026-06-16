<template>
  <div class="flex flex-col overflow-hidden" style="height:100%">

    <!-- ── 顶栏 ── -->
    <div
      class="flex items-center gap-2 px-4 shrink-0 bg-white border-b border-slate-100"
      style="height:44px;box-shadow:0 1px 4px rgba(30,41,80,0.06)"
    >
      <button
        class="flex items-center gap-1 text-slate-400 hover:text-slate-700 text-[13px] font-medium
               transition-colors cursor-pointer outline-none bg-transparent border-0 p-0 mr-1"
        @click="goBack"
      >
        <component :is="ChevronLeft" :size="15" />
        返回
      </button>

      <div class="w-px h-4 bg-slate-200 shrink-0" />

      <InlineEdit
        :value="pageName"
        display-style="font-size:13.5px;font-weight:600;color:#1e293b;max-width:200px"
        input-style="font-size:13.5px;font-weight:600;color:#1e293b;max-width:200px"
        @confirm="doRename"
      />

      <transition name="dot-fade">
        <span
          v-if="isDirty"
          class="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"
          title="有未保存的修改"
        />
      </transition>

      <div class="flex-1" />

      <n-button size="small" ghost @click="reloadKey++" title="重载预览">
        <template #icon><component :is="RotateCcw" :size="13" /></template>
      </n-button>

      <n-button
        size="small"
        :type="isDirty && saveState === 'idle' ? 'primary' : 'default'"
        :loading="saveState === 'saving'"
        style="min-width:76px"
        @click="doSave"
      >
        {{ saveState === 'saved' ? '✓ 已保存' : '保存' }}
      </n-button>

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
        />
      </div>

      <!-- 拖拽把手 -->
      <div
        class="shrink-0 group flex items-center justify-center select-none"
        style="width:6px;background:#e2e8f0;cursor:col-resize;transition:background 0.15s"
        :style="{ background: isResizing ? '#a5adde' : '' }"
        @mousedown.prevent="startResize"
      >
        <div
          class="w-px h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style="background:#94a3b8"
        />
      </div>

      <!-- 右：实时预览 -->
      <div class="flex-1 min-w-0 overflow-hidden relative">
        <div v-if="isResizing" class="absolute inset-0 z-20 cursor-col-resize" />
        <PlaygroundIframe :key="reloadKey" :html="previewHtml" class="w-full h-full" />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton } from 'naive-ui'
import { ChevronLeft, RotateCcw } from '@lucide/vue'
import { usePlayground } from '@/composables/usePlayground'
import PlaygroundIframe  from '@/components/playground/PlaygroundIframe.vue'
import LcMonacoEditor    from '@/components/lowcode/LcMonacoEditor.vue'
import InlineEdit        from '@/components/InlineEdit.vue'

defineOptions({ name: 'PlaygroundEditorView' })

const route  = useRoute()
const router = useRouter()

const { pages, getPage, savePage, renamePage } = usePlayground()

// ── 页面数据 ────────────────────────────────────────────────────────────────────
const pageId   = computed(() => route.params.id as string)
const pageName = computed(() => pages.value.find(p => p.id === pageId.value)?.name ?? '')

const editorCode = ref('')
const savedHtml  = ref('')

onMounted(() => {
  const p = getPage(pageId.value)
  if (!p) { router.replace('/playground'); return }
  editorCode.value = p.html
  savedHtml.value  = p.html
})

// ── 未保存状态 ─────────────────────────────────────────────────────────────────
const isDirty = computed(() => editorCode.value !== savedHtml.value)

// ── 保存 ───────────────────────────────────────────────────────────────────────
type SaveState = 'idle' | 'saving' | 'saved'
const saveState = ref<SaveState>('idle')
let saveTimer: ReturnType<typeof setTimeout> | null = null

function doSave() {
  if (saveState.value === 'saving') return
  const p = pages.value.find(pg => pg.id === pageId.value)
  if (!p) return
  saveState.value = 'saving'
  savePage({ ...p, html: editorCode.value })
  savedHtml.value = editorCode.value
  saveState.value = 'saved'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveState.value = 'idle' }, 1500)
}

function doRename(name: string) {
  if (name.trim()) renamePage(pageId.value, name.trim())
}

function goBack() {
  if (isDirty.value && !confirm('有未保存的修改，确认离开？')) return
  router.push('/playground')
}

// ── Cmd+S ──────────────────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); doSave() }
}
onMounted(()   => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (saveTimer) clearTimeout(saveTimer)
  if (previewTimer) clearTimeout(previewTimer)
})

// ── 实时预览 ───────────────────────────────────────────────────────────────────
const previewHtml = ref('')
const reloadKey   = ref(0)
let previewTimer: ReturnType<typeof setTimeout> | null = null

watch(editorCode, (val) => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => { previewHtml.value = val; reloadKey.value++ }, 500)
}, { immediate: true })

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

</script>

<style scoped>
.dot-fade-enter-active,
.dot-fade-leave-active { transition: opacity 0.25s }
.dot-fade-enter-from,
.dot-fade-leave-to    { opacity: 0 }
</style>
