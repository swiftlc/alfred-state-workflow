<template>
  <div
    class="w-full h-full flex items-center overflow-hidden px-1"
    :style="{
      fontSize:   (widget.style.fontSize ?? 14) + 'px',
      fontWeight: widget.style.fontWeight ?? 'normal',
      color:      widget.style.color ?? '#374151',
      background: widget.style.background ?? 'transparent',
      borderRadius: (widget.style.borderRadius ?? 0) + 'px',
      justifyContent: widget.style.textAlign === 'center' ? 'center'
                    : widget.style.textAlign === 'right'  ? 'flex-end' : 'flex-start',
    }"
  >{{ displayText }}</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Widget, RuntimeContext, LabelProps } from '@/types/lowcode'

const props = defineProps<{ widget: Widget; runtime: RuntimeContext; selected?: boolean }>()

const displayText = computed(() => {
  const text = (props.widget.props as LabelProps).text ?? ''
  return text.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => {
    const val = props.runtime.vars[key]
    return val != null ? String(val) : ''
  })
})
</script>
