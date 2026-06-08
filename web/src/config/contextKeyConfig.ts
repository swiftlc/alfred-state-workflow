import type { CopyOption } from '@/components/ContextItem.vue'
import { createDiscreteApi } from 'naive-ui'

const { message } = createDiscreteApi(['message'])

export interface KeyActionDef {
  key:      string
  label:    string
  disabled?: boolean
}

export interface KeyConfig {
  displayName:   string
  copyOptions?:  (value: string, meta?: Record<string, unknown>) => CopyOption[]
  extraActions?: KeyActionDef[]
  onAction?:     (key: string, value: string, meta?: Record<string, unknown>) => void
}

// ─── 全局 key → 行为映射 ──────────────────────────────────────────────────────
// 在此扩展新的 key，无需修改 ContextItem 代码

export const KEY_CONFIGS: Record<string, KeyConfig> = {
  route: {
    displayName:  '路径',
    extraActions: [
      { key: 'shepherd_search',  label: 'Shepherd 查询'   },
    ],
    onAction: (key) => {
      if (key === 'shepherd_search') message.info('Shepherd 查询 —— 开发中')
    },
  },

  reference: {
    displayName: '接口引用',
    copyOptions: (_, meta) => {
      const svc = String(meta?.serviceName ?? '')
      const mtd = String(meta?.methodName  ?? '')
      const opts: CopyOption[] = []
      if (svc) opts.push({ key: 'service', label: '复制服务名', value: svc })
      if (mtd) opts.push({ key: 'method',  label: '复制方法名', value: mtd })
      if (svc && mtd)
        opts.push({ key: 'ref', label: '复制引用', value: `${svc}#${mtd}` })
      return opts
    },
    extraActions: [
      { key: 'invoke', label: 'Invoke（开发中）', disabled: true },
    ],
  },

  appkey:      { displayName: 'Appkey'  },
  api_name:    { displayName: '接口名'  },
  api_group:   { displayName: '分组'    },
  http_method: { displayName: 'Method'  },
  node: {
    displayName:  '节点',
    extraActions: [
      { key: 'machine_jump', label: '机器跳转' },
    ],
  },
  swimlane:    { displayName: '泳道'    },
  version:     { displayName: '版本'    },

  traceId: {
    displayName: 'TraceId',
    extraActions: [
      { key: 'raptor_jump', label: 'Raptor 跳转' },
    ],
    onAction: (key, value, meta) => {
      if (key === 'raptor_jump') {
        const appkey    = String(meta?.appkey ?? 'ALL')
        const condition = encodeURIComponent(`"${value}"`)
        window.open(
          `https://raptor.mws-test.sankuai.com/log/topic/view/${encodeURIComponent(appkey)}?searchType=expert&searchGrammar=dsl&condition=${condition}`,
          '_blank',
        )
      }
    },
  },
}
