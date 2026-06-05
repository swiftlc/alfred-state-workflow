<template>
  <n-modal
    v-model:show="innerShow"
    :mask-closable="true"
    :show-icon="false"
    :auto-focus="false"
    transform-origin="center"
    style="width: 860px; max-width: 96vw"
  >
    <div class="bg-white rounded-xl overflow-hidden flex flex-col" style="height: 78vh">
      <!-- 头部 -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
        <!-- 调用状态 -->
        <span
          class="text-xs font-semibold px-2 py-0.5 rounded-full"
          :class="isSuccess
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-600 border border-red-200'"
        >
          {{ isSuccess ? '调用成功' : `失败 code=${parsed.code}` }}
        </span>

        <!-- 方法名 -->
        <span v-if="methodLabel" class="font-mono text-xs text-slate-500 truncate flex-1" :title="methodLabel">
          {{ methodLabel }}
        </span>
        <span v-else class="flex-1" />

        <!-- 耗时 -->
        <span v-if="invokeMs != null" class="text-xs text-slate-400">{{ invokeMs }}ms</span>

        <!-- 关闭 -->
        <n-button size="tiny" @click="innerShow = false">关闭</n-button>
      </div>

      <!-- TraceId 行 -->
      <div v-if="parsed.traceId" class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 shrink-0 bg-slate-50/50">
        <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0">TraceId</span>
        <a
          :href="raptorUrl"
          target="_blank"
          rel="noopener"
          class="font-mono text-[12px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2 py-0.5 rounded transition-colors flex-1 truncate"
          :title="`点击在 Raptor 查看全链路\n${parsed.traceId}`"
        >{{ parsed.traceId }}</a>
        <n-button size="tiny" ghost @click="copyTrace">复制</n-button>
      </div>

      <!-- msg 行（非 null 时展示） -->
      <div v-if="parsed.msg" class="px-4 py-2 border-b border-slate-100 shrink-0 bg-amber-50/60">
        <span class="text-xs text-amber-700">{{ parsed.msg }}</span>
      </div>

      <!-- 结果 -->
      <MonacoPreview
        :content="returnContent"
        class="flex-1 min-h-0 !rounded-none !border-0 !border-t !border-slate-100"
        style="height: 0"
      />
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NModal, NButton, useMessage } from 'naive-ui'
import MonacoPreview from './MonacoPreview.vue'

const props = defineProps<{
  show: boolean
  result: unknown
  appkey?: string
  invokeMs?: number | null
  methodLabel?: string
}>()

const emit = defineEmits<{ 'update:show': [val: boolean] }>()

const message = useMessage()

const innerShow = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

// ─── 解析响应结构 ──────────────────────────────────────────────────────────────
// 期望格式：{ success, code, msg, data: { traceId, return } }

interface ParsedResult {
  success: boolean
  code: number | null
  msg: string | null
  traceId: string
  returnVal: unknown
}

const parsed = computed((): ParsedResult => {
  const r = props.result
  if (!r || typeof r !== 'object') {
    return { success: false, code: null, msg: null, traceId: '', returnVal: r }
  }
  const obj = r as Record<string, unknown>
  const data = (obj.data && typeof obj.data === 'object')
    ? obj.data as Record<string, unknown>
    : null

  const traceId = typeof data?.traceId === 'string' ? data.traceId
    : typeof obj.traceId === 'string' ? obj.traceId : ''

  const returnVal = data?.['return'] !== undefined ? data['return']
    : obj['return'] !== undefined ? obj['return'] : r

  return {
    success: obj.success === true || Number(obj.code) === 0,
    code:    obj.code !== undefined ? Number(obj.code) : null,
    msg:     typeof obj.msg === 'string' && obj.msg ? obj.msg : null,
    traceId,
    returnVal,
  }
})

const isSuccess = computed(() => parsed.value.success)

// `data.return` 可能是 JSON 字符串或对象，统一转成字符串交给 MonacoPreview
const returnContent = computed(() => {
  const v = parsed.value.returnVal
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
})

// ─── Raptor 测服跳转 ───────────────────────────────────────────────────────────

const raptorUrl = computed(() => {
  const tid = parsed.value.traceId
  if (!tid) return '#'
  const appkey = props.appkey ?? 'ALL'
  // condition 值加引号，防止负号开头的 traceId 被解析为算术表达式
  const condition = encodeURIComponent(`"${tid}"`)
  return `https://raptor.mws-test.sankuai.com/log/topic/view/${encodeURIComponent(appkey)}?searchType=expert&searchGrammar=dsl&condition=${condition}`
})

function copyTrace() {
  navigator.clipboard.writeText(parsed.value.traceId).then(() => message.success('TraceId 已复制'))
}
</script>
