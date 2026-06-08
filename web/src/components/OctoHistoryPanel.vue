<!-- alfred-workflow/web/src/components/OctoHistoryPanel.vue -->
<template>
  <div class="hp-wrap">
    <!-- 搜索框 -->
    <div class="hp-search">
      <input
        v-model="searchText"
        class="hp-search__input"
        placeholder="搜索备注 / appkey / 方法…"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <!-- 标签筛选 chips -->
    <div v-if="allTags.length" class="hp-tags">
      <span
        v-for="tag in allTags"
        :key="tag"
        class="hp-tag"
        :class="{ 'hp-tag--active': activeTags.includes(tag) }"
        @click="toggleTag(tag)"
      >{{ tag }}</span>
    </div>

    <!-- 历史列表 -->
    <div class="hp-list">
      <div v-if="!filteredEntries.length" class="hp-empty">
        {{ isFiltering ? '无匹配结果' : '暂无历史记录' }}
      </div>
      <div
        v-for="e in filteredEntries"
        :key="e.id"
        class="hp-item"
        :class="{
          'hp-item--active': e.id === activeEntryId,
          'hp-item--pinned': e.pinned,
        }"
        @click="$emit('restore', e)"
      >
        <!-- 主行 -->
        <div class="hp-item__row1">
          <span class="hp-item__note">{{ e.note || e.methodName }}</span>
          <span class="hp-item__ms">{{ e.invokeMs != null ? `${e.invokeMs}ms` : '' }}</span>
        </div>
        <!-- 副行 -->
        <div class="hp-item__row2">
          <span class="hp-item__badge" :class="e.success ? 'hp-item__badge--ok' : 'hp-item__badge--fail'">
            {{ e.success ? '✓' : '✗' }}
          </span>
          <span class="hp-item__appkey">{{ shortAppkey(e.appkey) }}</span>
          <span class="hp-item__method">#{{ e.methodName }}</span>
        </div>
        <!-- 标签行 -->
        <div v-if="e.tags.length" class="hp-item__tags">
          <span v-for="t in e.tags" :key="t" class="hp-tag hp-tag--sm">{{ t }}</span>
        </div>
        <!-- hover 操作 -->
        <div class="hp-item__actions">
          <button class="hp-btn" :title="e.pinned ? '取消置顶' : '置顶'" @click.stop="$emit('pin', e.id)">
            {{ e.pinned ? '★' : '☆' }}
          </button>
          <button class="hp-btn" title="编辑备注" @click.stop="openEdit(e)">✏</button>
          <button class="hp-btn hp-btn--danger" title="删除" @click.stop="$emit('remove', e.id)">✕</button>
        </div>
      </div>
    </div>

    <!-- 底部清空 -->
    <div v-if="entries.length" class="hp-footer">
      <button class="hp-clear-btn" @click="$emit('clear')">清空未置顶</button>
    </div>

    <!-- 编辑备注 Modal -->
    <n-modal
      v-model:show="editModal.show"
      preset="dialog"
      title="编辑备注"
      positive-text="保存"
      negative-text="取消"
      :show-icon="false"
      @positive-click="submitEdit"
      @after-leave="resetEdit"
    >
      <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px">
        <n-input v-model:value="editModal.note" placeholder="这次调用是干什么的…" />
        <n-input
          v-model:value="editModal.tagInput"
          placeholder="输入标签后回车添加…"
          @keydown.enter.prevent="addTag"
        />
        <div v-if="editModal.tags.length" class="hp-tags" style="margin:0">
          <span
            v-for="t in editModal.tags"
            :key="t"
            class="hp-tag hp-tag--removable"
            @click="removeTag(t)"
          >{{ t }} ×</span>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { NModal, NInput } from 'naive-ui'
import { matchQuery } from '@/utils/search'
import type { OctoHistoryEntry } from '@/composables/useOctoHistory'

// ─── props / emits ────────────────────────────────────────────────────────────

const props = defineProps<{
  entries:       OctoHistoryEntry[]
  allTags:       string[]
  activeEntryId: string | null
}>()

const emit = defineEmits<{
  restore:    [entry: OctoHistoryEntry]
  remove:     [id: string]
  pin:        [id: string]
  updateNote: [id: string, note: string, tags: string[]]
  clear:      []
}>()

// ─── 搜索 / 标签筛选 ──────────────────────────────────────────────────────────

const searchText = ref('')
const activeTags = ref<string[]>([])

function toggleTag(tag: string) {
  const idx = activeTags.value.indexOf(tag)
  if (idx === -1) activeTags.value.push(tag)
  else activeTags.value.splice(idx, 1)
}

watch(() => props.allTags, (newTags) => {
  activeTags.value = activeTags.value.filter(t => newTags.includes(t))
})

const isFiltering = computed(() =>
  searchText.value.trim().length > 0 || activeTags.value.length > 0
)

const filteredEntries = computed((): OctoHistoryEntry[] => {
  let list = props.entries
  if (activeTags.value.length) {
    list = list.filter(e => activeTags.value.every(t => e.tags.includes(t)))
  }
  const q = searchText.value.trim()
  if (!q) return list
  return list.filter(e => matchQuery(q, e.note, e.appkey, e.methodName, e.serviceName))
})

// ─── 编辑备注 Modal ───────────────────────────────────────────────────────────

const editModal = reactive({
  show:     false,
  id:       '',
  note:     '',
  tagInput: '',
  tags:     [] as string[],
})

function openEdit(e: OctoHistoryEntry) {
  editModal.id       = e.id
  editModal.note     = e.note
  editModal.tagInput = ''
  editModal.tags     = [...e.tags]
  editModal.show     = true
}

function addTag() {
  const t = editModal.tagInput.trim()
  if (t && !editModal.tags.includes(t)) editModal.tags.push(t)
  editModal.tagInput = ''
}

function removeTag(t: string) {
  editModal.tags = editModal.tags.filter(x => x !== t)
}

function submitEdit() {
  emit('updateNote', editModal.id, editModal.note, editModal.tags)
  editModal.show = false
}

function resetEdit() {
  editModal.id = ''
  editModal.note = ''
  editModal.tagInput = ''
  editModal.tags = []
}

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

function shortAppkey(appkey: string): string {
  return appkey.split('.').at(-1) ?? appkey
}
</script>

<style scoped>
.hp-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid #e2e8f0;
  overflow: hidden;
}

.hp-search {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.hp-search__input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  outline: none;
  background: #f8fafc;
  color: #0f172a;
}
.hp-search__input:focus { border-color: #818cf8; background: #fff; }
.hp-search__input::placeholder { color: #94a3b8; }

.hp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.hp-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 8px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #475569;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.hp-tag:hover { background: #e2e8f0; }
.hp-tag--active { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
.hp-tag--sm { font-size: 10px; padding: 0 5px; }
.hp-tag--removable { cursor: pointer; }
.hp-tag--removable:hover { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }

.hp-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.hp-empty {
  text-align: center;
  padding: 32px 0;
  color: #94a3b8;
  font-size: 12px;
}

.hp-item {
  position: relative;
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.08s;
  border-bottom: 1px solid #f8fafc;
}
.hp-item:hover { background: #f8fafc; }
.hp-item--active { background: #eef2ff !important; }
.hp-item--pinned .hp-item__note::before { content: '★ '; color: #f59e0b; }

.hp-item__row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 3px;
}
.hp-item__note {
  font-size: 12px;
  font-weight: 500;
  color: #0f172a;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hp-item__ms { font-size: 10px; color: #94a3b8; flex-shrink: 0; }

.hp-item__row2 {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
}
.hp-item__badge {
  font-size: 10px;
  font-weight: 600;
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
}
.hp-item__badge--ok   { background: #d1fae5; color: #065f46; }
.hp-item__badge--fail { background: #fee2e2; color: #991b1b; }
.hp-item__appkey {
  font-size: 10px;
  color: #64748b;
  font-family: monospace;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hp-item__method {
  font-size: 10px;
  color: #6366f1;
  font-family: monospace;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hp-item__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 3px;
}

/* hover 操作 - 默认隐藏 */
.hp-item__actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: none;
  gap: 2px;
  background: rgba(255,255,255,0.95);
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 2px 4px;
}
.hp-item:hover .hp-item__actions { display: flex; }

.hp-btn {
  background: none;
  border: none;
  font-size: 12px;
  padding: 2px 4px;
  cursor: pointer;
  color: #64748b;
  border-radius: 3px;
  line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.hp-btn:hover { background: #f1f5f9; color: #0f172a; }
.hp-btn--danger:hover { background: #fee2e2; color: #dc2626; }

.hp-footer {
  padding: 6px 10px;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.hp-clear-btn {
  font-size: 11px;
  color: #94a3b8;
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 2px 10px;
  cursor: pointer;
  width: 100%;
  transition: background 0.1s, color 0.1s;
}
.hp-clear-btn:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
</style>
