<template>
  <div class="w-full h-full flex flex-col bg-white overflow-y-auto">
    <!-- 头部：组件类型 + 关闭 -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 shrink-0">
      <span class="text-xs font-medium text-slate-500 uppercase tracking-wider">{{ widget.type }} 属性</span>
      <button
        class="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-xs"
        title="关闭"
        @click="emit('close')"
      >✕</button>
    </div>

    <div class="p-3 flex flex-col gap-4">
      <!-- 通用样式 -->
      <section>
        <div class="text-[11px] font-medium text-slate-400 mb-2">样式</div>
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

      <!-- 位置 / 尺寸 -->
      <section>
        <div class="text-[11px] font-medium text-slate-400 mb-2">位置 / 尺寸</div>
        <div class="grid grid-cols-2 gap-1.5">
          <label class="lc-field-sm"><span>列</span>
            <input type="number" :value="widget.pos.col" min="1"
              @change="updatePos('col', Number(($event.target as HTMLInputElement).value))" /></label>
          <label class="lc-field-sm"><span>行</span>
            <input type="number" :value="widget.pos.row" min="1"
              @change="updatePos('row', Number(($event.target as HTMLInputElement).value))" /></label>
          <label class="lc-field-sm"><span>宽</span>
            <input type="number" :value="widget.pos.w" min="1"
              @change="updatePos('w', Number(($event.target as HTMLInputElement).value))" /></label>
          <label class="lc-field-sm"><span>高</span>
            <input type="number" :value="widget.pos.h" min="1"
              @change="updatePos('h', Number(($event.target as HTMLInputElement).value))" /></label>
        </div>
      </section>

      <!-- 组件专属属性 -->
      <section>
        <div class="text-[11px] font-medium text-slate-400 mb-2">组件属性</div>

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
          <div class="mt-2">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] text-slate-500">点击脚本</span>
              <button
                class="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
                @click="emit('open-script', '按钮点击脚本', (widget.props as ButtonProps).onClick ?? '', (c) => updateProp('onClick', c))"
              >{{ (widget.props as ButtonProps).onClick?.trim() ? '编辑 ✏️' : '+ 添加' }}</button>
            </div>
            <div v-if="(widget.props as ButtonProps).onClick?.trim()"
              class="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 line-clamp-3 leading-relaxed">
              {{ (widget.props as ButtonProps).onClick }}
            </div>
          </div>
        </template>

        <!-- Table -->
        <template v-else-if="widget.type === 'table'">
          <label class="lc-field"><span>数据变量</span>
            <input :value="(widget.props as TableProps).dataVar"
              placeholder="如 rows"
              @change="updateProp('dataVar', ($event.target as HTMLInputElement).value)" /></label>
          <div class="mt-2">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] text-slate-500">列定义 (JSON)</span>
              <button
                class="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
                @click="emit('open-script', '列定义 JSON', JSON.stringify((widget.props as TableProps).columns ?? [], null, 2), (c) => onColumnsChange(c), 'json')"
              >编辑 ✏️</button>
            </div>
            <div class="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 line-clamp-2 leading-relaxed">
              {{ JSON.stringify((widget.props as TableProps).columns ?? []) }}
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Widget, WidgetStyle, GridPos, LabelProps, InputProps, ButtonProps, TableProps } from '@/types/lowcode'

const props = defineProps<{ widget: Widget }>()
const emit  = defineEmits<{
  update:      [widget: Widget]
  close:       []
  'open-script': [title: string, code: string, onSave: (c: string) => void, lang?: string]
}>()

function updateStyle(key: keyof WidgetStyle, val: unknown) {
  emit('update', { ...props.widget, style: { ...props.widget.style, [key]: val } })
}

function updatePos(key: keyof GridPos, val: number) {
  emit('update', { ...props.widget, pos: { ...props.widget.pos, [key]: val } })
}

function updateProp(key: string, val: unknown) {
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
.lc-field span { width: 52px; flex-shrink: 0; }
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

.lc-field-sm {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #475569;
}
.lc-field-sm span { width: 20px; flex-shrink: 0; }
.lc-field-sm input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 2px 5px;
  font-size: 11px;
  outline: none;
  background: #f8fafc;
  min-width: 0;
}
.lc-field-sm input:focus { border-color: #818cf8; }

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
