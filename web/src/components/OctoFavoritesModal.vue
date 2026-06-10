<template>
  <DictPicker
    :show="show"
    dict-key="octo-favorites"
    dict-name="收藏"
    placeholder="搜索备注 / appkey / 方法…"
    width="720px"
    :items="dictItems"
    :current-value="null"
    :allow-input="false"
    :search-fields="searchFields"
    @update:show="emit('update:show', $event)"
    @select="handleSelect"
  >
    <!-- 搜索框右侧：条目计数 -->
    <template #search-suffix="{ count }">
      <span class="fav-count">{{ count }} 条</span>
    </template>

    <!-- 条目自定义渲染 -->
    <template #item="{ item, isActive }">
      <span class="fav-body">
        <!-- 第一行：备注（可编辑） -->
        <span class="fav-row1">
          <span class="fav-note" @click.stop>
            <InlineEdit
              :value="getMeta(item)?.note ?? ''"
              placeholder="添加备注…"
              display-style="font-size:14px;font-weight:600;color:#334155"
              input-style="font-size:14px;font-weight:600;"
              @confirm="note => handleUpdateNote(item, note)"
            />
          </span>
        </span>

        <!-- 第二行：ServiceShortName#method · 耗时 -->
        <span class="fav-row2">
          <span class="fav-method" :class="isActive && 'fav-method--active'">{{ item.description }}</span>
          <span v-if="getMeta(item)?.invokeMs != null" class="fav-ms" :class="isActive && 'fav-dim'">
            {{ getMeta(item)!.invokeMs }}ms
          </span>
        </span>

        <!-- 第三行：用户标签 -->
        <span v-if="visibleTags(item).length" class="fav-tags" @click.stop>
          <span
            v-for="t in visibleTags(item)" :key="t"
            class="fav-tag" :class="isActive && 'fav-tag--active'"
          >
            {{ t }}
            <button class="fav-tag__rm" @click.stop="removeTag(item, t)">×</button>
          </span>
        </span>
      </span>
    </template>

    <!-- 条目操作按钮 -->
    <template #item-actions="{ item }">
      <button class="fav-btn fav-btn--danger" title="删除" @click="emit('remove', item.id)">
        <Trash2 :size="12" />
      </button>
    </template>

    <!-- 底部 footer -->
    <template #footer>
      <span class="fav-footer__count">{{ entries.length }} 条收藏</span>
      <button class="fav-clear-btn" @click="emit('clear')">清空全部</button>
    </template>
  </DictPicker>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Trash2 } from '@lucide/vue'
import DictPicker from '@/components/DictPicker.vue'
import InlineEdit from '@/components/InlineEdit.vue'
import { shortName } from '@/utils/search'
import type { DictItem, ContextDataItem } from '@/types'
import type { OctoHistoryEntry } from '@/composables/useOctoHistory'

// id → entry 映射，供 slot 内读取原始数据
const metaMap = new Map<string, OctoHistoryEntry>()

const props = defineProps<{
  show: boolean
  entries: OctoHistoryEntry[]
  activeEntryId: string | null
}>()

const emit = defineEmits<{
  'update:show': [val: boolean]
  restore:    [entry: OctoHistoryEntry]
  remove:     [id: string]
  updateNote: [id: string, note: string, tags: string[]]
  clear:      []
}>()

// OctoHistoryEntry → DictItem（搜索 / 列表展示用）
const dictItems = computed((): DictItem[] => {
  metaMap.clear()
  return props.entries.map(e => {
    metaMap.set(e.id, e)
    return {
      id:          e.id,
      name:        e.note || e.methodName,
      value:       e.appkey,
      description: shortName(e.serviceName) + '#' + e.methodName,
      pinned:      false,
      lastUsedAt:  e.savedAt,
      tags:        e.tags.map(t => ({ label: t })),
    }
  })
})

// 搜索字段：备注、appkey、方法名、服务名
function searchFields(item: DictItem): string[] {
  const e = metaMap.get(item.id)
  return [item.name, item.description ?? '', e?.appkey ?? '', e?.serviceName ?? '']
}

function getMeta(item: DictItem): OctoHistoryEntry | undefined {
  return metaMap.get(item.id)
}

function visibleTags(item: DictItem): string[] {
  return (item.tags ?? []).map(t => t.label)
}


function handleSelect(ctx: ContextDataItem) {
  const entry = metaMap.get(ctx.id)
  if (entry) emit('restore', entry)
}

function handleUpdateNote(item: DictItem, note: string) {
  const entry = metaMap.get(item.id)
  if (entry) emit('updateNote', entry.id, note, entry.tags)
}

function removeTag(item: DictItem, tag: string) {
  const entry = metaMap.get(item.id)
  if (entry) emit('updateNote', entry.id, entry.note, entry.tags.filter(t => t !== tag))
}
</script>

<style scoped>
.fav-count {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
  white-space: nowrap;
}

.fav-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.fav-row1 {
  display: flex;
  align-items: center;
  min-height: 22px;
}
.fav-note {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.fav-row2 {
  display: flex;
  align-items: center;
  gap: 5px;
}
.fav-method {
  font-size: 11px;
  color: #6366f1;
  font-family: monospace;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fav-method--active { color: #334155 !important; }
.fav-ms  { font-size: 10px; color: #94a3b8; flex-shrink: 0; font-family: monospace; }
.fav-dim { color: #64748b !important; }

.fav-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.fav-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #475569;
  user-select: none;
}
.fav-tag__rm {
  font-size: 11px;
  line-height: 1;
  background: none;
  border: none;
  padding: 0 0 0 2px;
  cursor: pointer;
  color: #94a3b8;
  transition: color 0.1s;
}
.fav-tag__rm:hover { color: #dc2626; }
.fav-tag--active {
  background: #e2e8f0 !important;
  border-color: #cbd5e1 !important;
  color: #475569 !important;
}

.fav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  color: #94a3b8;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.fav-btn:hover          { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
.fav-btn--danger:hover  { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }

.fav-footer__count { font-size: 11px; color: #94a3b8; }
.fav-clear-btn {
  font-size: 11px;
  color: #94a3b8;
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 3px 12px;
  cursor: pointer;
  margin-left: auto;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.fav-clear-btn:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
</style>
