import {http} from '../core/HttpClient';
import {MAFKA_BASE_URL, MAFKA_HEADERS, MAFKA_TARGET_ENV} from '../config/constants';

export {MAFKA_BASE_URL};

export interface MafkaMsgItem {
  msgId: string;
  content: string;
  tag: string | null;
  timestamp: string;
  partitionId: number;
}

/**
 * 查询 topic 在测试环境下的真实 topicId。
 * 优先取 environment=test 的 id，兜底用传入的 baseTopicId。
 */
export async function resolveEnvTopicId(baseTopicId: string): Promise<string> {
  try {
    const destUrl = `${MAFKA_BASE_URL}/mafka/restful/topic/environment/list?topicId=${baseTopicId}`;
    const response = await http.proxy<{ code: number; data: Array<{ id: number; environment: string }> }>(
      'GET', destUrl, { headers: MAFKA_HEADERS }
    );
    if (response?.code === 0 && Array.isArray(response.data)) {
      const testTopic = response.data.find((t) => t.environment === MAFKA_TARGET_ENV);
      if (testTopic) return String(testTopic.id);
    }
  } catch { /* 降级：使用 base topicId */ }
  return baseTopicId;
}
