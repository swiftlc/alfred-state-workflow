import { proxyGet, proxyPost } from '@/utils/proxy'

const BASE    = 'https://mafka.mws-test.sankuai.com'
const HEADERS = { 'm-appkey': 'fe_mafka-fe' }

export type EnvTag = 'test' | 'staging' | 'prod'

export interface MafkaTopic {
  id:               number
  topicId:          number
  taskName:         string
  topicName?:       string
  description?:     string
  envTag?:          string
  buId?:            number
  producerAppkey?:  string
  consumerGroupNum?: number
}

export interface MafkaSubscription {
  consumerGroups: Array<{
    groupName:  string
    appkey:     string
    consumeType?: string
    remark?:    string
  }>
  producerInfos: Array<{
    appkey: string
  }>
}

export interface MafkaMessage {
  partition:  number
  offset:     number
  timestamp:  number
  key?:       string
  value:      string
}

// ── Topic list ─────────────────────────────────────────────────────────────

export async function fetchTopicsByAppkey(appkey: string, envTag: EnvTag = 'test'): Promise<MafkaTopic[]> {
  const url = `${BASE}/mafka/restful/topic/findByProducerAppkey?appkey=${encodeURIComponent(appkey)}&envTag=${envTag}`
  const res = await proxyGet<{ code: number; data: MafkaTopic[] }>(url, HEADERS)
  return res.data ?? []
}

export async function searchTopics(keyword: string, envTag: EnvTag = 'test'): Promise<MafkaTopic[]> {
  const url = `${BASE}/mafka/restful/topic/search?keyword=${encodeURIComponent(keyword)}&envTag=${envTag}&pageSize=30`
  const res = await proxyGet<{ code: number; data: { list?: MafkaTopic[]; records?: MafkaTopic[] } }>(url, HEADERS)
  return res.data?.list ?? res.data?.records ?? []
}

// ── Topic detail / subscriptions ──────────────────────────────────────────

export async function fetchTopicSubscriptions(topicId: number): Promise<MafkaSubscription | null> {
  const url = `${BASE}/mafka/restful/topic/subscribeInfo?topicId=${topicId}`
  const res = await proxyGet<{ code: number; data: MafkaSubscription }>(url, HEADERS)
  return res.data ?? null
}

// ── Send message ──────────────────────────────────────────────────────────

export interface SendMessageParams {
  topicId:   number
  taskName:  string
  appkey:    string
  message:   string   // raw JSON string or plain string
  swimlane?: string
}

export async function sendMafkaMessage(p: SendMessageParams): Promise<{ success: boolean; msg: string; auditId?: number }> {
  const content = JSON.stringify({
    topicId:  p.topicId,
    messages: p.message,
    swimlane: p.swimlane ?? '',
  })
  const res = await proxyPost<{ code: number; msg: string; data: { auditId?: number; applicantStatus?: string } }>(
    `${BASE}/mafka/restful/audit/apply`,
    {
      objectType: 'TOPIC',
      auditType:  'SEND_MESSAGE',
      content,
      taskName:   p.taskName,
      topicId:    p.topicId,
      appkey:     p.appkey,
    },
    HEADERS,
  )
  return {
    success: res.code === 0 && res.data?.applicantStatus === 'PASS',
    msg:     res.msg ?? '',
    auditId: res.data?.auditId ?? undefined,
  }
}

// ── Pull / search messages ────────────────────────────────────────────────

export interface PullMessagesParams {
  topicId:    number
  taskName:   string
  appkey:     string
  partition?: number
  offset?:    number   // -1 = latest
  count?:     number
}

export async function pullMafkaMessages(p: PullMessagesParams): Promise<MafkaMessage[]> {
  const content = JSON.stringify({
    topicId:   p.topicId,
    partition: p.partition ?? 0,
    offset:    p.offset ?? -1,
    count:     p.count ?? 20,
  })
  const res = await proxyPost<{ code: number; msg: string; data: { applicantStatus?: string; response?: string } }>(
    `${BASE}/mafka/restful/audit/apply`,
    {
      objectType: 'TOPIC',
      auditType:  'QUERY_MESSAGE',
      content,
      taskName:   p.taskName,
      topicId:    p.topicId,
      appkey:     p.appkey,
    },
    HEADERS,
  )
  if (res.code !== 0) return []
  try {
    const response = res.data?.response
    if (!response) return []
    const parsed = typeof response === 'string' ? JSON.parse(response) : response
    return Array.isArray(parsed) ? parsed : (parsed.messages ?? parsed.records ?? [])
  } catch {
    return []
  }
}
