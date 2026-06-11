<template>
  <div class="w-full h-full flex flex-col p-3 border-l border-slate-100 bg-white overflow-y-auto">
    <div v-if="!widget" class="flex-1 flex items-center justify-center text-slate-300 text-xs">
      选中组件后在此编辑属性
    </div>
    <template v-else>
      <div class="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">
        {{ widget.type }} 属性
      </div>

      <!-- 通用样式 -->
      <section class="mb-4">
        <div class="text-[11px] font-medium text-slate-500 mb-2">样式</div>
        <div class="flex flex-col gap-2">
          <label class="lc-field">
            <span>字号</span>
            <input type="number" :value="widget.style.fontSize ?? 14" min="10" max="64"
              @change="updateStyle('fontSize', Number(($event.target as HTMLInputElement).value))" />
          </label>
          <label class="lc-field">
            <span>颜色</span>
            <input type="color" :value="widget.style.color ?? '#374151'"
              @change="updateStyle('color', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="lc-field">
            <span>背景</span>
            <input type="color" :value="widget.style.background ?? '#ffffff'"
              @change="updateStyle('background', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="lc-field">
            <span>对齐</span>
            <select :value="widget.style.textAlign ?? 'left'"
              @change="updateStyle('textAlign', ($event.target as HTMLSelectElement).value)">
              <option value="left">左对齐</option>
              <option value="center">居中</option>
              <option value="right">右对齐</option>
            </select>
          </label>
        </div>
      </section>

      <!-- 位置 -->
      <section class="mb-4">
        <div class="text-[11px] font-medium text-slate-500 mb-2">位置 / 尺寸</div>
        <div class="flex flex-col gap-2">
          <label class="lc-field"><span>列起始</span>
            <input type="number" :value="widget.pos.col" min="1" @change="updatePos('col', Number(($event.target as HTMLInputElement).value))" /></label>
          <label class="lc-field"><span>行起始</span>
            <input type="number" :value="widget.pos.row" min="1" @change="updatePos('row', Number(($event.target as HTMLInputElement).value))" /></label>
          <label class="lc-field"><span>列宽</span>
            <input type="number" :value="widget.pos.w" min="1" @change="updatePos('w', Number(($event.target as HTMLInputElement).value))" /></label>
          <label class="lc-field"><span>行高</span>
            <input type="number" :value="widget.pos.h" min="1" @change="updatePos('h', Number(($event.target as HTMLInputElement).value))" /></label>
        </div>
      </section>

      <!-- 组件专属属性 -->
      <section>
        <div class="text-[11px] font-medium text-slate-500 mb-2">组件属性</div>

        <!-- Label -->
        <template v-if="widget.type === 'label'">
          <label class="lc-field-col">
            <span>文本内容</span>
            <textarea :value="(widget.props as LabelProps).text"
              placeholder="支持 {{varName}} 变量插值"
              rows="3"
              @change="updateProp('text', ($event.target as HTMLTextAreaElement).value)" />
          </label>
        </template>

        <!-- Input -->
        <template v-else-if="widget.type === 'input'">
          <label class="lc-field"><span>占位文本</span>
            <input :value="(widget.props as InputProps).placeholder"
              @change="updateProp('placeholder', ($event.target as HTMLInputElement).value)" /></label>
          <label class="lc-field mt-2"><span>变量名</span>
            <input :value="(widget.props as InputProps).varName"
              placeholder="如 keyword"
              @change="updateProp('varName', ($event.target as HTMLInputElement).value)" /></label>
        </template>

        <!-- Button -->
        <template v-else-if="widget.type === 'button'">
          <label class="lc-field"><span>按钮文字</span>
            <input :value="(widget.props as ButtonProps).label"
              @change="updateProp('label', ($event.target as HTMLInputElement).value)" /></label>
          <label class="lc-field-col mt-2">
            <span>点击脚本</span>
            <textarea :value="(widget.props as ButtonProps).onClick"
              placeholder="const rows = await $sql('SELECT ...')\n$set('data', rows)"
              rows="5"
              class="font-mono text-xs"
              @change="updateProp('onClick', ($event.target as HTMLTextAreaElement).value)" />
          </label>
        </template>

        <!-- Table -->
        <template v-else-if="widget.type === 'table'">
          <label class="lc-field"><span>数据变量</span>
            <input :value="(widget.props as TableProps).dataVar"
              placeholder="如 rows"
              @change="updateProp('dataVar', ($event.target as HTMLInputElement).value)" /></label>
          <label class="lc-field-col mt-2">
            <span>列定义 (JSON)</span>
            <textarea
              :value="JSON.stringify((widget.props as TableProps).columns ?? [], null, 2)"
              rows="5"
              class="font-mono text-xs"
              placeholder='[{"key":"id","title":"ID"},{"key":"name","title":"名称"}]'
              @change="onColumnsChange(($event.target as HTMLTextAreaElement).value)" />
          </label>
        </template>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Widget, WidgetStyle, GridPos, LabelProps, InputProps, ButtonProps, TableProps } from '@/types/lowcode'

const props = defineProps<{ widget: Widget | null }>()
const emit  = defineEmits<{ update: [widget: Widget] }>()

function updateStyle(key: keyof WidgetStyle, val: unknown) {
  if (!props.widget) return
  emit('update', { ...props.widget, style: { ...props.widget.style, [key]: val } })
}

function updatePos(key: keyof GridPos, val: number) {
  if (!props.widget) return
  emit('update', { ...props.widget, pos: { ...props.widget.pos, [key]: val } })
}

function updateProp(key: string, val: unknown) {
  if (!props.widget) return
  const newProps = { ...props.widget.props, [key]: val } as Widget['props']
  emit('update', { ...props.widget, props: newProps })
}

function onColumnsChange(raw: string) {
  try {
    const cols = JSON.parse(raw)
    updateProp('columns', cols)
  } catch { /* 解析失败时不更新 */ }
}
</script>

<style scoped>
.lc-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #475569;
}
.lc-field span { width: 56px; flex-shrink: 0; }
.lc-field input,
.lc-field select {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 3px 6px;
  font-size: 11px;
  outline: none;
  background: #f8fafc;
}
.lc-field input:focus,
.lc-field select:focus { border-color: #818cf8; }

.lc-field-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #475569;
}
.lc-field-col textarea {
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 11px;
  outline: none;
  background: #f8fafc;
  resize: vertical;
}
.lc-field-col textarea:focus { border-color: #818cf8; }
</style>
