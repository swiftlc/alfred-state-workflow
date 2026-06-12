<template>
  <div
    ref="canvasEl"
    class="relative w-full overflow-auto"
    :style="{ minHeight: '600px', background: '#fafafa' }"
    @dragover.prevent="onDragOver"
    @drop="onDrop"
    @mouseup="onCanvasMouseUp"
  >
    <!-- 网格背景 -->
    <div
      class="absolute inset-0 pointer-events-none"
      :style="{
        backgroundImage: `
          linear-gradient(to right, #e2e8f0 1px, transparent 1px),
          linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
        `,
        backgroundSize: `${cellW}px 40px`,
      }"
    />

    <!-- CSS Grid 容器 -->
    <div
      data-canvas-bg
      class="relative"
      :style="{
        display: 'grid',
        gridTemplateColumns: `repeat(${page.cols}, ${cellW}px)`,
        gridAutoRows: '40px',
        minHeight: '600px',
      }"
    >
      <!-- 已放置的组件 -->
      <div
        v-for="w in page.widgets"
        :key="w.id"
        class="relative group"
        :draggable="true"
        :style="{
          gridColumn: `${w.pos.col} / span ${w.pos.w}`,
          gridRow:    `${w.pos.row} / span ${w.pos.h}`,
          outline:    selectedId === w.id ? '2px solid #6366f1' : '1px solid #e2e8f0',
          zIndex:     selectedId === w.id ? 10 : 1,
          cursor:     'grab',
          padding:    '2px',
          opacity:    draggingId === w.id ? 0.4 : 1,
        }"
        @mousedown.stop="onWidgetMouseDown($event)"
        @mouseup.stop="onWidgetMouseUp($event, w.id)"
        @dragstart="onWidgetDragStart($event, w.id)"
        @dragend="draggingId = null"
      >
        <component
          :is="widgetComponent(w.type)"
          :widget="w"
          :runtime="dummyRuntime"
        />
        <!-- 编辑态遮罩：覆盖子元素，确保鼠标事件能被 widget 容器接收 -->
        <div class="absolute inset-0 z-10" style="cursor:grab" />
        <!-- 删除按钮（z-index 高于遮罩） -->
        <button
          class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-400 text-white text-xs hidden group-hover:flex items-center justify-center z-20 leading-none"
          @mousedown.stop
          @mouseup.stop
          @click.stop="emit('remove', w.id)"
        >✕</button>
      </div>

      <!-- 空状态引导 -->
      <div
        v-if="!page.widgets.length && !dropPreview"
        class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none"
        style="z-index:0"
      >
        <div class="text-3xl mb-2 opacity-20">🧩</div>
        <div class="text-xs text-slate-300">从左侧拖拽组件到此处</div>
      </div>

      <!-- 拖拽落点预览 -->
      <div
        v-if="dropPreview"
        class="pointer-events-none bg-indigo-100 border-2 border-dashed border-indigo-300 rounded opacity-70"
        :style="{
          gridColumn: `${dropPreview.col} / span ${dropPreview.w}`,
          gridRow:    `${dropPreview.row} / span ${dropPreview.h}`,
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import type { LowCodePage, WidgetType, RuntimeContext } from '@/types/lowcode'

const WIDGET_COMPONENTS = {
  label:  defineAsyncComponent(() => import('./widgets/LcLabel.vue')),
  input:  defineAsyncComponent(() => import('./widgets/LcInput.vue')),
  button: defineAsyncComponent(() => import('./widgets/LcButton.vue')),
  table:  defineAsyncComponent(() => import('./widgets/LcTable.vue')),
}

const props = defineProps<{
  page: LowCodePage
  selectedId: string | null
}>()

const emit = defineEmits<{
  select:  [id: string]
  deselect: []
  remove:  [id: string]
  drop:    [type: WidgetType, col: number, row: number]
  move:    [id: string, col: number, row: number]
}>()

const canvasEl    = ref<HTMLElement>()
const dropPreview = ref<{ col: number; row: number; w: number; h: number } | null>(null)
const draggingId  = ref<string | null>(null)
const canvasWidth = ref(0)

// ResizeObserver 追踪画布宽度变化
let ro: ResizeObserver | null = null
onMounted(() => {
  if (canvasEl.value) {
    canvasWidth.value = canvasEl.value.clientWidth
    ro = new ResizeObserver(([entry]) => {
      canvasWidth.value = entry.contentRect.width
    })
    ro.observe(canvasEl.value)
  }
})
onUnmounted(() => { ro?.disconnect() })

// 用 mousedown/mouseup 区分点击和拖拽（draggable 会吃掉 click 事件）
let mouseDownPos = { x: 0, y: 0 }

function onWidgetMouseDown(e: MouseEvent) {
  mouseDownPos = { x: e.clientX, y: e.clientY }
}

function onWidgetMouseUp(e: MouseEvent, id: string) {
  const dx = Math.abs(e.clientX - mouseDownPos.x)
  const dy = Math.abs(e.clientY - mouseDownPos.y)
  if (dx < 5 && dy < 5) {
    emit('select', id)
  }
}

function onCanvasMouseUp(e: MouseEvent) {
  // 点击的是画布背景（不是 widget），取消选中
  if ((e.target as HTMLElement) === canvasEl.value ||
      (e.target as HTMLElement).closest?.('[data-canvas-bg]')) {
    emit('deselect')
  }
}

const cellW = computed(() =>
  canvasWidth.value > 0 ? Math.floor(canvasWidth.value / props.page.cols) : 40
)

function posToGrid(e: DragEvent): { col: number; row: number } {
  const rect = canvasEl.value!.getBoundingClientRect()
  const x    = e.clientX - rect.left + canvasEl.value!.scrollLeft
  const y    = e.clientY - rect.top  + canvasEl.value!.scrollTop
  const col  = Math.max(1, Math.min(props.page.cols, Math.floor(x / cellW.value) + 1))
  const row  = Math.max(1, Math.floor(y / 40) + 1)
  return { col, row }
}

function onWidgetDragStart(e: DragEvent, id: string) {
  draggingId.value = id
  e.dataTransfer?.setData('widget-id', id)
  e.dataTransfer?.setData('widget-type', '')  // 清空，区分来源
}

function onDragOver(e: DragEvent) {
  const { col, row } = posToGrid(e)
  const id = e.dataTransfer?.getData('widget-id')
  const movingWidget = id ? props.page.widgets.find(w => w.id === id) : null
  dropPreview.value = {
    col, row,
    w: movingWidget?.pos.w ?? 4,
    h: movingWidget?.pos.h ?? 1,
  }
}

function onDrop(e: DragEvent) {
  const { col, row } = posToGrid(e)
  dropPreview.value  = null
  draggingId.value   = null

  const widgetId = e.dataTransfer?.getData('widget-id')
  const type     = e.dataTransfer?.getData('widget-type') as WidgetType | undefined

  if (widgetId) {
    // 移动已有组件
    emit('move', widgetId, col, row)
  } else if (type) {
    // 从面板拖入新组件
    emit('drop', type, col, row)
  }
}

function widgetComponent(type: WidgetType) {
  return WIDGET_COMPONENTS[type]
}

const dummyRuntime: RuntimeContext = {
  vars: {},
  setVar: () => {},
  runScript: async () => {},
}
</script>
