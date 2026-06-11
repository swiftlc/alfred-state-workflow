<template>
  <button
    class="w-full h-full px-3 rounded text-sm font-medium transition-all duration-100 active:scale-95 active:brightness-90 hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-300"
    :style="{
      background:   widget.style.background ?? '#6366f1',
      color:        widget.style.color ?? '#fff',
      borderRadius: (widget.style.borderRadius ?? 6) + 'px',
      opacity:      (selected || running) ? 0.7 : 1,
      cursor:       selected ? 'default' : running ? 'wait' : 'pointer',
    }"
    :disabled="selected"
    @click="handleClick"
  >
    <span v-if="running" class="opacity-60">执行中…</span>
    <span v-else>{{ (widget.props as ButtonProps).label || '按钮' }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Widget, RuntimeContext, ButtonProps } from '@/types/lowcode'

const props = defineProps<{ widget: Widget; runtime: RuntimeContext; selected?: boolean }>()
const running = ref(false)

async function handleClick() {
  const code = (props.widget.props as ButtonProps).onClick
  if (!code?.trim()) return
  running.value = true
  try { await props.runtime.runScript(code) } finally { running.value = false }
}
</script>
