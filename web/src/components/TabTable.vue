<template>
  <div ref="rootRef" class="flex flex-col min-h-0">
    <!-- 自定义 tab header -->
    <div ref="tabHeaderRef" class="flex border-b border-slate-200 shrink-0">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="relative px-4 py-2 text-sm font-medium cursor-pointer transition-colors outline-none appearance-none bg-transparent border-0"
        :class="modelValue === tab.key ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'"
        @click="$emit('update:modelValue', tab.key)"
      >
        {{ tab.label }}
        <span
          v-if="modelValue === tab.key"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
        />
      </button>
    </div>

    <!--
      scoped slot 暴露 contentHeight（ResizeObserver 实测像素值）。
      内部使用者将其传给 n-data-table 的 :max-height，
      可让 thead 固定、tbody 在确定高度内滚动。
    -->
    <div class="flex-1 min-h-0">
      <slot :height="contentHeight" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{
  tabs: { key: string; label: string }[]
  modelValue: string
}>()

defineEmits<{ 'update:modelValue': [key: string] }>()

const rootRef      = ref<HTMLElement | null>(null)
const tabHeaderRef = ref<HTMLElement | null>(null)
const contentHeight = ref(0)

let ro: ResizeObserver | null = null

function measure() {
  const rootH   = rootRef.value?.offsetHeight      ?? 0
  const headerH = tabHeaderRef.value?.offsetHeight ?? 0
  contentHeight.value = Math.max(0, rootH - headerH)
}

onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (rootRef.value) ro.observe(rootRef.value)
})

onUnmounted(() => { ro?.disconnect() })
</script>
