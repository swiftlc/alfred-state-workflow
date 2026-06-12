<template>
  <div class="flex h-full overflow-hidden relative">

    <!-- 编辑模式 -->
    <template v-if="mode === 'edit'">
      <!-- 左：组件面板 (160px) -->
      <div style="width:160px; flex-shrink:0">
        <ComponentPalette />
      </div>

      <!-- 中：画布区 -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- 工具栏 -->
        <div class="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
          <span class="text-[11px] text-slate-400">初始化脚本</span>
          <n-button
            size="tiny" ghost
            @click="openScriptModal('初始化脚本', localPage.initScript, (c) => localPage.initScript = c)"
          >{{ localPage.initScript.trim() ? '已配置 ✏️' : '+ 配置' }}</n-button>
          <span class="text-[10px] text-slate-300 hidden xl:inline">$sql(query)  $set(key, val)  $vars</span>
          <div class="ml-auto">
            <n-button type="primary" size="small" @click="emit('save', localPage)">保存</n-button>
          </div>
        </div>

        <LowCodeCanvas
          :page="localPage"
          :selected-id="selectedId"
          class="flex-1"
          @select="selectedId = $event"
          @deselect="selectedId = null"
          @remove="handleRemove"
          @drop="handleDrop"
          @move="handleMove"
        />
      </div>

      <!-- 右：属性侧栏（宽度动态切换，transition 用 CSS） -->
      <div
        class="lc-panel-side"
        :class="selectedWidget ? 'lc-panel-side--open' : 'lc-panel-side--closed'"
      >
        <PropertyPanel
          v-if="selectedWidget"
          :widget="selectedWidget"
          :key="selectedWidget.id"
          @update="handleWidgetUpdate"
          @close="selectedId = null"
          @open-script="(title, code, onSave, lang) => openScriptModal(title, code, onSave, lang)"
        />
      </div>
    </template>

    <!-- 预览模式 -->
    <template v-else>
      <LowCodeRenderer :page="localPage" class="flex-1" />
    </template>

    <!-- initScript 编辑弹窗 -->
    <n-modal
      v-model:show="scriptModal.show"
      preset="dialog"
      :title="scriptModal.title"
      style="width:780px"
      positive-text="确定"
      @positive-click="() => { scriptModal.onSave(scriptModal.code); scriptModal.show = false }"
    >
      <div class="pt-2">
        <p class="text-xs text-slate-400 mb-2">
          可用 API：
          <code class="font-mono bg-slate-100 px-1 rounded">$sql(query)</code>
          <code class="font-mono bg-slate-100 px-1 rounded ml-1">$set(key, val)</code>
          <code class="font-mono bg-slate-100 px-1 rounded ml-1">$vars</code>
          <code class="font-mono bg-slate-100 px-1 rounded ml-1">$page</code>
        </p>
        <div class="border border-slate-200 rounded-lg overflow-hidden">
          <LcMonacoEditor
            v-if="scriptModal.show"
            v-model="scriptModal.code"
            :language="scriptModal.lang"
            height="420px"
          />
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'
import LcMonacoEditor from './LcMonacoEditor.vue'
import type { LowCodePage, Widget, WidgetType } from '@/types/lowcode'
import ComponentPalette from './ComponentPalette.vue'
import PropertyPanel    from './PropertyPanel.vue'
import LowCodeCanvas    from './LowCodeCanvas.vue'
import LowCodeRenderer  from './LowCodeRenderer.vue'

const props = defineProps<{ page: LowCodePage; mode: 'edit' | 'preview' }>()
const emit  = defineEmits<{ save: [page: LowCodePage] }>()

// 本地副本，保存时才写回
const localPage   = reactive<LowCodePage>({ ...props.page, widgets: [...props.page.widgets] })
const selectedId  = ref<string | null>(null)

// 脚本编辑弹窗（initScript + button onClick + table columns 共用）
const scriptModal = reactive<{
  show:     boolean
  title:    string
  code:     string
  lang:     string
  onSave:   (code: string) => void
}>({
  show: false, title: '', code: '', lang: 'javascript', onSave: () => {},
})

function openScriptModal(title: string, code: string, onSave: (code: string) => void, lang = 'javascript') {
  scriptModal.title  = title
  scriptModal.code   = code
  scriptModal.lang   = lang
  scriptModal.onSave = onSave
  scriptModal.show   = true
}

watch(() => props.page, (p) => {
  Object.assign(localPage, { ...p, widgets: [...p.widgets] })
}, { deep: true })

const selectedWidget = computed(() =>
  selectedId.value ? localPage.widgets.find(w => w.id === selectedId.value) ?? null : null
)

// 默认 props 工厂
function defaultProps(type: WidgetType): Widget['props'] {
  if (type === 'label')  return { text: '文本' }
  if (type === 'input')  return { placeholder: '请输入', varName: 'input1' }
  if (type === 'button') return { label: '按钮', onClick: '' }
  if (type === 'table')  return { dataVar: 'rows', columns: [] }
  return { text: '' }
}

function handleDrop(type: WidgetType, col: number, row: number) {
  const widget: Widget = {
    id:    crypto.randomUUID(),
    type,
    pos:   { col, row, w: 6, h: 1 },
    style: {},
    props: defaultProps(type),
  }
  localPage.widgets = [...localPage.widgets, widget]
  selectedId.value  = widget.id
}

function handleRemove(id: string) {
  localPage.widgets = localPage.widgets.filter(w => w.id !== id)
  if (selectedId.value === id) selectedId.value = null
}

function handleWidgetUpdate(updated: Widget) {
  localPage.widgets = localPage.widgets.map(w => w.id === updated.id ? updated : w)
}

function handleMove(id: string, col: number, row: number) {
  localPage.widgets = localPage.widgets.map(w =>
    w.id === id ? { ...w, pos: { ...w.pos, col, row } } : w
  )
}
</script>

<style scoped>
.lc-panel-side {
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.18s ease;
  border-left: 1px solid #f1f5f9;
}
.lc-panel-side--open   { width: 240px; }
.lc-panel-side--closed { width: 0; border-left: none; }
</style>

