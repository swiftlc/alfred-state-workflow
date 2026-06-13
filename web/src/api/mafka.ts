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
  tag?:       string   // 泳道标签，来自 API 响应的 tag 字段
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
  const sendTopicId = p.topicId + 1
  const content = JSON.stringify({
    topicId:  sendTopicId,
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
      topicId:    sendTopicId,
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

// ── Query messages by timestamp（直接查，无需 audit）─────────────────────

export interface QueryMessageParams {
  topicId:   number
  dateTime?: string    // 'YYYY-MM-DD HH:mm:ss'，默认当前时间
  limit?:    number
}

export async function queryMafkaMessages(p: QueryMessageParams): Promise<MafkaMessage[]> {
  const dt = p.dateTime ?? new Date().toLocaleString('sv-SE').replace('T', ' ')
  const url = `${BASE}/mafka/restful/message/timestamp/query?topicId=${p.topicId + 1}&dateTime=${encodeURIComponent(dt)}&limit=${p.limit ?? 10}`
  const res = await proxyGet<{ code: number; msg: string; data: Array<{
    offset: number; timestamp: string; partitionId: number; content: string; msgId?: string; tag?: string | null
  }> }>(url, HEADERS)
  if (res.code !== 0 || !Array.isArray(res.data)) return []
  return res.data.map(m => ({
    partition: m.partitionId,
    offset:    m.offset,
    timestamp: new Date(m.timestamp).getTime(),
    value:     m.content,
    key:       m.msgId,
    tag:       m.tag ?? undefined,
  }))
}

// ── Consumer groups ───────────────────────────────────────────────────────

export interface MafkaConsumer {
  id:         number
  name:       string
  appkey:     string
  remark?:    string
  status:     number
  environment: string
  addTime:    string
  tags?:      string[]
}

export async function fetchConsumersByTopicId(topicId: number): Promise<MafkaConsumer[]> {
  const url = `${BASE}/mafka/restful/consumer/listByTopicId?topicId=${topicId}&pageNum=1&limit=50&type=3&content=&auth=-1`
  const res = await proxyGet<{ code: number; data: MafkaConsumer[] }>(url, HEADERS)
  return Array.isArray(res.data) ? res.data : []
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
