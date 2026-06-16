<template>
  <div class="flex flex-col overflow-hidden" style="height:100%;background:#f8fafc">

    <!-- ── 顶栏 ── -->
    <div class="flex items-center gap-2 px-4 shrink-0 bg-white border-b border-slate-100"
         style="height:44px;box-shadow:0 1px 4px rgba(30,41,80,0.06)">

      <button
        class="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-[13px] font-medium
               transition-colors cursor-pointer outline-none bg-transparent border-0 p-0 mr-1"
        @click="goBack"
      >
        <component :is="ChevronLeft" :size="15" />
        <span>返回</span>
      </button>

      <div class="w-px h-4 bg-slate-200 shrink-0" />

      <InlineEdit
        :value="pageName"
        display-style="font-size:13.5px;font-weight:600;color:#1e293b;max-width:200px"
        input-style="font-size:13.5px;font-weight:600;color:#1e293b;max-width:200px"
        @confirm="doRename"
      />

      <transition name="fade">
        <span v-if="isDirty" class="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" title="有未保存的修改" />
      </transition>

      <div class="flex-1" />

      <n-button size="small" ghost @click="reloadKey++" title="重载预览">
        <template #icon><component :is="RotateCcw" :size="13" /></template>
      </n-button>

      <n-button
        size="small"
        :type="saveState === 'idle' && isDirty ? 'primary' : 'default'"
        :loading="saveState === 'saving'"
        style="min-width:72px"
        @click="doSave"
      >
        {{ saveState === 'saved' ? '✓ 已保存' : '保存' }}
      </n-button>

      <n-button
        size="small"
        :type="aiOpen ? 'primary' : 'default'"
        :ghost="!aiOpen"
        @click="aiOpen = !aiOpen"
        title="AI 编码助手"
      >
        <template #icon><component :is="Sparkles" :size="13" /></template>
        AI
      </n-button>
    </div>

    <!-- ── 主编辑区 ── -->
    <div
      class="flex flex-1 min-h-0 overflow-hidden"
      @mousemove="onResizeMove"
      @mouseup="stopResize"
      @mouseleave="stopResize"
    >
      <!-- 左：Monaco -->
      <div class="flex flex-col min-w-0 overflow-hidden bg-white" :style="{ width: leftPct + '%' }">
        <LcMonacoEditor
          v-model="editorCode"
          language="html"
          height="100%"
        />
      </div>

      <!-- 拖拽把手 -->
      <div
        class="shrink-0 select-none relative group"
        :style="{
          width: '6px',
          background: isResizing ? '#a5adde' : '#e2e8f0',
          cursor: 'col-resize',
          transition: isResizing ? 'none' : 'background 0.15s',
        }"
        @mousedown.prevent="startResize"
      >
        <div class="absolute inset-y-0 left-0 right-0 flex items-center justify-center pointer-events-none">
          <div
            class="w-0.5 h-8 rounded-full transition-opacity duration-150"
            :style="{ background: '#94a3b8', opacity: isResizing ? 1 : 0 }"
            style="group-hover:opacity-100"
          />
        </div>
      </div>

      <!-- 右：预览 -->
      <div class="flex-1 min-w-0 overflow-hidden relative">
        <div v-if="isResizing" class="absolute inset-0 z-20 cursor-col-resize" />
        <PlaygroundIframe :key="reloadKey" :html="previewHtml" class="w-full h-full" />
      </div>
    </div>

    <!-- ── AI 面板 ── -->
    <div
      class="shrink-0 bg-white border-t border-slate-100 flex flex-col overflow-hidden"
      :style="{ height: aiOpen ? '340px' : '0px', transition: 'height 0.2s ease' }"
    >
      <!-- 面板头部 -->
      <div class="flex items-center px-4 shrink-0 border-b border-slate-100" style="height:40px">
        <component :is="Sparkles" :size="13" style="color:#5b6af0;margin-right:6px;flex-shrink:0" />
        <span class="text-[13px] font-semibold text-slate-700">AI 助手</span>
        <span class="text-[11px] text-slate-400 ml-2 hidden sm:block">描述需求，AI 直接修改代码</span>
        <div class="flex-1" />
        <button
          class="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer outline-none bg-transparent border-0 p-1 rounded"
          @click="aiOpen = false"
        >
          <component :is="ChevronDown" :size="14" />
        </button>
      </div>

      <!-- 消息列表 -->
      <div ref="msgListRef" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        <div v-if="!ai.messages.value.length"
             class="flex flex-col items-center justify-center h-full text-slate-300 select-none">
          <component :is="Sparkles" :size="28" class="mb-2 opacity-40" />
          <p class="text-xs">描述你想要什么，AI 会帮你写代码</p>
          <p class="text-[11px] mt-1 opacity-70">例：「加一个清空按钮」「把表格改成卡片布局」</p>
        </div>

        <div
          v-for="(msg, idx) in ai.messages.value"
          :key="idx"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[75%] px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words"
            :class="msg.role === 'user'
              ? 'bg-indigo-500 text-white rounded-2xl rounded-br-sm shadow-sm'
              : 'bg-slate-50 border border-slate-100 text-slate-700 rounded-2xl rounded-bl-sm'"
          >
            <template v-if="msg.updatedHtml">
              <span class="flex items-center gap-1.5 font-medium mb-1" style="font-size:11.5px;color:#059669">
                <component :is="Check" :size="12" />
                已更新代码
              </span>
              <span v-if="msg.content" class="text-slate-600 block" style="font-size:12px">{{ msg.content }}</span>
            </template>
            <template v-else>{{ msg.content }}</template>
          </div>
        </div>

        <!-- Loading 气泡 -->
        <div v-if="ai.loading.value" class="flex justify-start">
          <div class="bg-slate-50 border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
            <div class="flex gap-1 items-center" style="height:16px">
              <span
                v-for="i in 3" :key="i"
                class="w-1.5 h-1.5 rounded-full bg-slate-400"
                :style="{ animation: 'bounce 1s infinite', animationDelay: (i - 1) * 0.15 + 's' }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="px-4 pb-3 pt-2 shrink-0 border-t border-slate-50">
        <div class="flex gap-2 items-end">
          <n-input
            v-model:value="aiInput"
            type="textarea"
            placeholder="描述需求… (Cmd+Enter 发送)"
            :autosize="{ minRows: 1, maxRows: 3 }"
            style="font-size:13px"
            :disabled="ai.loading.value"
            @keydown="onAiKeydown"
          />
          <n-button
            type="primary"
            size="small"
            :loading="ai.loading.value"
            :disabled="!aiInput.trim()"
            style="height:34px;flex-shrink:0"
            @click="sendAi"
          >
            <template #icon><component :is="Send" :size="12" /></template>
          </n-button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter }       from 'vue-router'
import { NButton, NInput, useMessage } from 'naive-ui'
import { ChevronLeft, ChevronDown, RotateCcw, Sparkles, Send, Check } from '@lucide/vue'
import { usePlayground }   from '@/composables/usePlayground'
import { usePlaygroundAI } from '@/composables/usePlaygroundAI'
import PlaygroundIframe    from '@/components/playground/PlaygroundIframe.vue'
import LcMonacoEditor      from '@/components/lowcode/LcMonacoEditor.vue'
import InlineEdit          from '@/components/InlineEdit.vue'

defineOptions({ name: 'PlaygroundEditorView' })

const route   = useRoute()
const router  = useRouter()
const message = useMessage()
const { pages, getPage, savePage, renamePage } = usePlayground()

// ── 页面数据 ────────────────────────────────────────────────────────────────
const pageId   = computed(() => route.params.id as string)
const pageName = computed(() => pages.value.find(p => p.id === pageId.value)?.name ?? '')

const editorCode = ref('')
const savedHtml  = ref('')
const isDirty    = computed(() => editorCode.value !== savedHtml.value)

onMounted(() => {
  const p = getPage(pageId.value)
  if (!p) { router.replace('/playground'); return }
  editorCode.value = p.html
  savedHtml.value  = p.html
})

// ── 保存 ─────────────────────────────────────────────────────────────────────
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

// ── Cmd+S ────────────────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); doSave() }
}
onMounted(()   => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// ── 实时预览 debounce 500ms ───────────────────────────────────────────────────
const previewHtml = ref('')
const reloadKey   = ref(0)
let previewTimer: ReturnType<typeof setTimeout> | null = null

watch(editorCode, (val) => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => { previewHtml.value = val; reloadKey.value++ }, 500)
}, { immediate: true })

// ── 拖拽调宽 ──────────────────────────────────────────────────────────────────
const leftPct    = ref(50)
const isResizing = ref(false)
let startX = 0, startPct = 0

function startResize(e: MouseEvent) {
  isResizing.value = true
  startX = e.clientX
  startPct = leftPct.value
}
function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return
  const w = (e.currentTarget as HTMLElement).getBoundingClientRect().width
  leftPct.value = Math.min(80, Math.max(20, startPct + ((e.clientX - startX) / w) * 100))
}
function stopResize() { isResizing.value = false }

// ── AI 面板 ───────────────────────────────────────────────────────────────────
const aiOpen     = ref(false)
const aiInput    = ref('')
const msgListRef = ref<HTMLElement | null>(null)
const ai = usePlaygroundAI(() => editorCode.value)

async function sendAi() {
  const text = aiInput.value.trim()
  if (!text) return
  aiInput.value = ''
  const updatedHtml = await ai.send(text)
  await nextTick()
  if (msgListRef.value) msgListRef.value.scrollTop = msgListRef.value.scrollHeight
  if (updatedHtml) {
    editorCode.value = updatedHtml
    message.success('AI 已更新代码，记得保存 ✓')
  }
}

function onAiKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendAi() }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s }
.fade-enter-from,  .fade-leave-to      { opacity: 0 }
@keyframes bounce {
  0%, 100% { transform: translateY(0) }
  50%      { transform: translateY(-4px) }
}
</style>
