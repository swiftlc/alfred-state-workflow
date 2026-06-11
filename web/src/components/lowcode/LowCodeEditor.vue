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
        <!-- initScript 编辑入口 -->
        <div class="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-white shrink-0">
          <span class="text-[11px] font-medium text-slate-400">初始化脚本</span>
          <button
            class="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
            @click="scriptModal.show = true"
          >{{ localPage.initScript.trim() ? '已配置 ✏️' : '+ 配置' }}</button>
          <span class="ml-auto text-[10px] text-slate-300">可用 API：$sql(query)  $set(key, val)  $vars</span>
        </div>

        <LowCodeCanvas
          :page="localPage"
          :selected-id="selectedId"
          class="flex-1"
          @select="selectedId = $event"
          @remove="handleRemove"
          @drop="handleDrop"
          @move="handleMove"
        />
      </div>

      <!-- 右：属性侧栏（选中 widget 时滑入） -->
      <transition name="panel-slide">
        <div v-if="selectedWidget" style="width:240px; flex-shrink:0; border-left:1px solid #f1f5f9; position:relative">
          <button
            class="absolute -left-3 top-4 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 z-10 text-xs"
            title="关闭属性面板"
            @click="selectedId = null"
          >✕</button>
          <PropertyPanel
            :widget="selectedWidget"
            @update="handleWidgetUpdate"
          />
        </div>
      </transition>

      <!-- 保存按钮 -->
      <div class="absolute bottom-4 right-4 z-10">
        <n-button type="primary" @click="emit('save', localPage)">保存</n-button>
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
      title="初始化脚本"
      style="width:680px"
      positive-text="确定"
      @positive-click="scriptModal.show = false"
    >
      <div class="pt-2">
        <p class="text-xs text-slate-400 mb-2">
          页面加载时自动执行。可用 API：
          <code class="font-mono">$sql(query)</code>、
          <code class="font-mono">$set(key, val)</code>、
          <code class="font-mono">$vars</code>
        </p>
        <div class="border border-slate-200 rounded-lg overflow-hidden">
          <LcMonacoEditor
            v-model="localPage.initScript"
            language="javascript"
            height="300px"
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
const scriptModal = reactive({ show: false })

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
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  width: 0 !important;
  opacity: 0;
}
</style>
