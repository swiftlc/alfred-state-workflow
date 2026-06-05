<template>
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
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

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

function onBlur() {
  if (suppressBlur) { suppressBlur = false; return }
  if (composing.value) return
  doConfirm()
}
</script>

<style scoped>
.ied-display {
  cursor: pointer;
  display: inline-block;
  min-width: 1em;
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
  font: inherit;
  width: 100%;
  color: inherit;
}
</style>
