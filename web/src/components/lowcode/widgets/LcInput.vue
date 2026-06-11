<template>
  <input
    class="w-full h-full px-2 border border-slate-200 rounded text-sm outline-none focus:border-indigo-300 bg-white"
    :placeholder="(widget.props as InputProps).placeholder ?? ''"
    :value="String(runtime.vars[(widget.props as InputProps).varName] ?? '')"
    @input="(e) => runtime.setVar((widget.props as InputProps).varName, (e.target as HTMLInputElement).value)"
  />
</template>

<script setup lang="ts">
import type { Widget, RuntimeContext, InputProps } from '@/types/lowcode'
defineProps<{ widget: Widget; runtime: RuntimeContext; selected?: boolean }>()
</script>
