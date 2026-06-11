<template>
  <div class="w-full h-full flex flex-col p-3 border-r border-slate-100 bg-white">
    <div class="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">组件</div>
    <div class="flex flex-col gap-2">
      <div
        v-for="item in PALETTE"
        :key="item.type"
        class="flex items-center gap-2.5 px-3 py-2.5 border border-slate-100 rounded-lg bg-slate-50 cursor-grab hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors select-none"
        :draggable="true"
        @dragstart="(e) => onDragStart(e, item.type)"
      >
        <span class="text-base leading-none">{{ item.icon }}</span>
        <div>
          <div class="text-xs font-medium text-slate-700">{{ item.label }}</div>
          <div class="text-[10px] text-slate-400">{{ item.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WidgetType } from '@/types/lowcode'

const PALETTE: Array<{ type: WidgetType; icon: string; label: string; desc: string }> = [
  { type: 'label',  icon: '🏷️', label: 'Label',  desc: '文本展示，支持变量绑定' },
  { type: 'input',  icon: '✏️', label: 'Input',  desc: '输入框，写入运行时变量' },
  { type: 'button', icon: '🔘', label: 'Button', desc: '触发点击事件脚本' },
  { type: 'table',  icon: '📋', label: 'Table',  desc: '展示数组变量为表格' },
]

function onDragStart(e: DragEvent, type: WidgetType) {
  e.dataTransfer?.setData('widget-type', type)
}
</script>
