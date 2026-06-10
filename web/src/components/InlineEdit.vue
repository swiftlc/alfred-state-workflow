<template>
  <span ref="rootRef" style="display:inline-block;line-height:1.5;width:100%">
    <span
      v-if="!editing"
      class="ied-display"
      :class="{ 'ied-placeholder': value === '' }"
      :style="displayStyle"
      @click="startEdit"
    >{{ value !== '' ? value : placeholder }}</span>
    <input
      v-else
      ref="inputRef"
      v-model="draft"
      class="ied-input"
      :style="inputStyle"
      :placeholder="placeholder"
      @compositionstart="composing = true"
      @compositionend="composing = false"
      @keydown.enter="onEnter"
      @keydown.esc.prevent="cancel"
      @blur="onBlur"
    />
  </span>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'

const props = withDefaults(defineProps<{
  value: string
  placeholder?: string
  displayStyle?: string
  inputStyle?: string
}>(), {
  placeholder: '点击编辑',
})

const emit = defineEmits<{ confirm: [value: string] }>()

const editing   = ref(false)
const draft     = ref('')
const composing = ref(false)
const rootRef   = ref<HTMLElement>()
const inputRef  = ref<HTMLInputElement>()
let suppressBlur = false

async function startEdit() {
  draft.value   = props.value
  editing.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function doConfirm() {
  suppressBlur  = true
  editing.value = false
  const val = draft.value.trim()
  if (val !== props.value) emit('confirm', val)
}

function cancel() {
  suppressBlur  = true
  editing.value = false
}

function onEnter() {
  if (composing.value) return
  doConfirm()
}

// blur 仅作 Tab 键等场景的兜底，mousedown 外部检测已覆盖主路径
function onBlur() {
  if (suppressBlur) { suppressBlur = false; return }
  if (composing.value) return
  doConfirm()
}

function onDocMouseDown(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    doConfirm()
  }
}

watch(editing, (v) => {
  if (v) {
    document.addEventListener('mousedown', onDocMouseDown)
  } else {
    document.removeEventListener('mousedown', onDocMouseDown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
})
</script>

<style scoped>
.ied-display {
  cursor: pointer;
  display: inline-block;
  min-width: 1em;
  line-height: 1.5;
  padding: 0;
  margin: 0;
}
.ied-display:hover {
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 2px;
}
.ied-placeholder {
  color: #d1d5db;
}
.ied-placeholder:hover {
  color: #9ca3af;
}
.ied-input {
  border: none;
  border-bottom: 1.5px solid #6366f1;
  outline: none;
  background: transparent;
  padding: 0;
  margin: 0;
  font: inherit;
  width: 100%;
  color: inherit;
  line-height: 1.5;
  height: 1.5em;
  box-sizing: border-box;
}
</style>
