<template>
  <div class="flex items-center justify-center h-full text-slate-300">编辑器加载中…</div>
</template>
<script setup lang="ts">
import type { LowCodePage } from '@/types/lowcode'
defineProps<{ page: LowCodePage; mode: 'edit' | 'preview' }>()
defineEmits<{ save: [page: LowCodePage] }>()
</script>
