<template>
  <div class="w-full h-full flex flex-col p-3 border-r border-slate-100 bg-white">
    <div class="text-[11px] font-medium text-slate-400 mb-3 uppercase tracking-wider">组件库</div>
    <div class="flex flex-col gap-1.5">
      <div
        v-for="item in PALETTE"
        :key="item.type"
        class="flex items-center gap-2.5 px-2.5 py-2 border border-slate-100 rounded-lg bg-slate-50/60 cursor-grab hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors select-none group"
        :draggable="true"
        @dragstart="(e) => onDragStart(e, item.type)"
      >
        <component :is="item.icon" :size="14" class="text-slate-400 group-hover:text-indigo-500 flex-shrink-0 transition-colors" />
        <div>
          <div class="text-xs font-medium text-slate-700 group-hover:text-indigo-700 transition-colors">{{ item.label }}</div>
          <div class="text-[10px] text-slate-400 leading-tight mt-0.5">{{ item.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Type, TextCursor, MousePointerClick, Table } from '@lucide/vue'
import type { Component } from 'vue'
import type { WidgetType } from '@/types/lowcode'

const PALETTE: Array<{ type: WidgetType; icon: Component; label: string; desc: string }> = [
  { type: 'label',  icon: Type,             label: 'Label',  desc: '文本，支持 {{变量}} 插值' },
  { type: 'input',  icon: TextCursor,        label: 'Input',  desc: '输入框，写入运行时变量' },
  { type: 'button', icon: MousePointerClick, label: 'Button', desc: '触发点击事件脚本' },
  { type: 'table',  icon: Table,             label: 'Table',  desc: '展示数组变量为表格' },
]

function onDragStart(e: DragEvent, type: WidgetType) {
  e.dataTransfer?.setData('widget-type', type)
}
</script>
