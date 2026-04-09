import PluginManager from '../core/PluginManager';
import {http} from '../core/HttpClient';
import Logger from '../core/Logger';
import CacheManager from '../core/CacheManager';
import {copyToClipboard, openUrl, sendNotification} from '../core/utils';
import {icon} from '../core/icons';
import {PROXY_BASE_URL} from './constants';
import type {ContextData, DictItem, Feature} from '../types';

export {PROXY_BASE_URL};

/**
 * 功能矩阵配置
 *
 * - id:            唯一标识
 * - name:          功能名称（支持动态函数）
 * - description:   功能描述（支持动态函数）
 * - requiredKeys:  依赖的字典上下文 key 列表
 * - action:        对应执行动作名称（在 handlers/actions.ts 中注册）
 * - type:          split_by_dict 表示对所有已选字典项各生成一个条目
 */
const builtInFeatures: Feature[] = [
  {
    id: 'tenant_swimlane_login',
    name: '🚀租户泳道登录',
    description: '',
    requiredKeys: ['tenant', 'swimlane'],
    action: 'login',
    icon: icon('login'),
  },
  {
    id: 'jump_qnh_management',
    name: '🌐 牵牛花M端跳转',
    description: '',
    requiredKeys: ['swimlane'],
    action: 'jump_qnh_management',
    icon: icon('search'),
  },
  {
    id: 'jump_qnh',
    name: '🌐 牵牛花跳转',
    description: '',
    requiredKeys: ['swimlane'],
    action: 'jump_qnh',
    icon: icon('search'),
  },
  {
    id: 'copy_dict_value',
    label: '📋 复制字典值',
    icon: icon('cache'),
    name: (data: ContextData) =>
      `📋 复制 ${(data['_currentDict'] as DictItem | undefined)?.name ?? ''}: ${(data['_currentSelected'] as DictItem | undefined)?.name ?? ''}`,
    description: (data: ContextData) =>
      `将 ${(data['_currentDict'] as DictItem | undefined)?.name ?? ''} [${(data['_currentSelected'] as DictItem | undefined)?.name ?? ''}] 复制到剪切板`,
    requiredKeys: [],
    action: 'copy_to_clipboard',
    type: 'split_by_dict',
    recordHistory: false,
  },
  {
    id: 'modify_dict_desc',
    label: '📝 修改字典描述',
    icon: icon('context'),
    name: (data: ContextData) =>
      `📝 修改描述：${(data['_currentDict'] as DictItem | undefined)?.name ?? ''}: ${(data['_currentSelected'] as DictItem | undefined)?.name ?? ''}`,
    description: (data: ContextData) =>
      `当前描述：${(data['_currentSelected'] as DictItem | undefined)?.description ?? ''}`,
    requiredKeys: [],
    excludeKeys:["appkey"],
    action: 'modify_dict_desc',
    type: 'split_by_dict',
    recordHistory: false,
    requiredInputs: [
      {
        key: 'input1',
        label: '描述',
        placeholder: '请输入要修改的描述内容',
      },
    ],
    actionHandler: async (context, wf) => {
      Logger.info(`修改描述：${JSON.stringify(context)}`);
      const currentSelected = context.data['_currentSelected'] as DictItem;
      const currentDict = context.data['_currentDict'] as DictItem;
      const input1 = context.data['input1'] as DictItem;

      await http.put(`${PROXY_BASE_URL}/dictionaries`, {
        categoryKey: currentDict.key,
        title: currentSelected.name,
        description: input1.value,
      }, {
        headers: { 'Content-Type': 'application/json' },
      });
      const dictKey = String(currentDict.key);
      CacheManager.clear(`dict_items_${dictKey}`);
      // 同步更新 context 里已选中条目的 description，避免 feature item 展示旧值
      if (context.data[dictKey]) {
        (context.data[dictKey] as DictItem).description = input1.value;
        wf.saveContext({ state: 'home', data: context.data });
      }
      sendNotification('修改成功！', '修改成功');
    },
  },
  {
    id: 'view_swimlane_machines',
    name: '🖥️ 泳道机器查看',
    description: '查看当前泳道下的机器状态',
    requiredKeys: ['swimlane'],
    icon: icon('task'),
    condition: (data: ContextData) => {
      const swimlane = data['swimlane'] as DictItem | undefined;
      Logger.info('当前泳道信息', swimlane as object ?? {});
      return !!(swimlane?.description);
    },
    requiredInputs: [
      {
        key: 'machine',
        label: '机器',
        placeholder: '请选择机器',
        disableManualInput: true,
        cacheKey: (contextData: ContextData) => {
          const swimlane = contextData['swimlane'] as DictItem | undefined;
          return `swimlane_machines:${swimlane?.description ?? ''}`;
        },
        cacheTtl: 60 * 1000,
        fetchOptions: async (_query: string, contextData: ContextData): Promise<DictItem[]> => {
          const swimlane = contextData['swimlane'] as DictItem;
          const stackUuid = swimlane.description ?? '';
          try {
            const proxyDest = `https://dev.sankuai.com/gateway/cargo/api/stack?type=runners_octo_status&stack_uuid=${stackUuid}`;
            const response = await http.proxy<{ data?: Record<string, MachineInfo> }>('GET', proxyDest);
            Logger.info('接口响应', response as object);
            if (response?.data) {
              const machines = Object.values(response.data);
              machines.sort((a, b) => (a.appkey ?? '').localeCompare(b.appkey ?? ''));
              return machines.map((m) => ({
                name: m.appkey ?? '',
                description: `IP: ${m.ip} | 状态: ${m.status} | 节点: ${m.nodeStatus}${m.errMsg ? ' | 错误: ' + m.errMsg : ''}`,
                value: m as unknown as string,
              }));
            }
            return [];
          } catch {
            return [];
          }
        },
      },
    ],
    action: 'view_swimlane_machines_action',
    actionHandler: async (context) => {
      const machine = (context.data['machine'] as DictItem & { value: MachineInfo }).value;
      openUrl(`https://jumper.mws.sankuai.com/terminal?hostIp=${machine.ip}`);
    },
  },
  {
    id: 'view_appkey_machines',
    name: (data: ContextData) => {
      const appkey = data['appkey'] as DictItem | undefined;
      return `🖥️ appkey 机器列表`;
    },
    description: (data: ContextData) => {
      const appkey = data['appkey'] as DictItem | undefined;
      return `${appkey ? ` ${appkey.name}` : ''}`;
    },
    requiredKeys: ['appkey'],
    icon: icon('task'),
    requiredInputs: [
      {
        key: 'appkey_node',
        label: '服务节点',
        placeholder: '请选择节点',
        disableManualInput: true,
        cacheKey: (contextData: ContextData) => {
          const appkey = contextData['appkey'] as DictItem | undefined;
          const appkeyValue = appkey?.value ?? appkey?.name ?? '';
          return `appkey_nodes:${appkeyValue}:test`;
        },
        cacheTtl: 60 * 1000,
        fetchOptions: async (_query: string, contextData: ContextData): Promise<DictItem[]> => {
          const appkey = contextData['appkey'] as DictItem;
          const appkeyValue = appkey.value ?? appkey.name;
          try {
            const proxyDest = `https://octo.mws-test.sankuai.com/api/octo/v2/thriftcheck/serverNodes?appkey=${appkeyValue}&env=test`;
            const response = await http.proxy<OctoServerNodesResponse>('GET', proxyDest);
            Logger.info('appkey 机器列表响应', response as object);
            if (response?.success && Array.isArray(response.data)) {
              return response.data.map((node) => {
                const statusText = node.status === 0 ? '正常' : `异常(${node.status})`;
                const swimlaneText = node.swimlane ? `${node.swimlane}` : 'default';
                return {
                  name: `${node.ip} | ${swimlaneText}`,
                  description: ` 状态: ${statusText}`,
                  value: node as unknown as string,
                };
              });
            }
            return [];
          } catch {
            return [];
          }
        },
      },
      {
        key: 'appkey_node_action',
        label: '操作',
        placeholder: '请选择要执行的操作',
        disableManualInput: true,
        fetchOptions: async (): Promise<DictItem[]> => {
          return [
            { name: '🔗 跳转节点', value: 'jump', description: '通过 SSH 跳板机连接该节点' },
            { name: '📋 查看服务方法', value: 'view_methods', description: '查看该节点暴露的 Thrift 服务方法列表' },
          ];
        },
      },
      {
        key: 'appkey_method',
        label: '服务方法',
        placeholder: '请选择要查看的服务方法',
        disableManualInput: true,
        /** 仅在选择了「查看服务方法」时才需要此步骤 */
        skipIf: (contextData) => (contextData['appkey_node_action'] as DictItem | undefined)?.value !== 'view_methods',
        cacheKey: (contextData: ContextData) => {
          const appkey = contextData['appkey'] as DictItem | undefined;
          const node = (contextData['appkey_node'] as DictItem & { value: OctoServerNode } | undefined)?.value;
          const appkeyValue = appkey?.value ?? appkey?.name ?? '';
          return `appkey_methods:${appkeyValue}:${node?.ip ?? ''}:${node?.port ?? ''}`;
        },
        cacheTtl: 60 * 1000,
        fetchOptions: async (_query: string, contextData: ContextData): Promise<DictItem[]> => {
          const appkey = contextData['appkey'] as DictItem;
          const node = (contextData['appkey_node'] as DictItem & { value: OctoServerNode }).value;
          const appkeyValue = appkey.value ?? appkey.name;
          try {
            const proxyDest = `https://octo.mws-test.sankuai.com/api/octo/v2/thriftcheck/serviceMethods?appkey=${appkeyValue}&host=${node.ip}&port=${node.port}&isRequestPort=false`;
            const response = await http.proxy<OctoServiceMethodsResponse>('GET', proxyDest);
            Logger.info('服务方法响应', response as object);
            if (response?.success && response.data) {
              const methods: Array<{ serviceName: string; method: string }> = [];
              for (const [svcClass, methodMap] of Object.entries(response.data)) {
                const serviceName = svcClass.split('.').pop() ?? svcClass;
                for (const methodSignature of Object.keys(methodMap as Record<string, unknown>)) {
                  const methodName = methodSignature.split('(')[0] ?? methodSignature;
                  methods.push({ serviceName, method: methodName });
                }
              }
              methods.sort((a, b) => a.method.localeCompare(b.method));
              return methods.map((m) => ({
                name: m.serviceName,
                description: m.method,
                value: `${m.serviceName}#${m.method}`,
              }));
            }
            return [];
          } catch {
            return [];
          }
        },
      },
    ],
    action: 'view_appkey_machines_action',
    actionHandler: async (context) => {
      const node = (context.data['appkey_node'] as DictItem & { value: OctoServerNode }).value;
      const action = (context.data['appkey_node_action'] as DictItem | undefined)?.value;
      const method = (context.data['appkey_method'] as DictItem | undefined)?.value;

      if (action === 'view_methods' && method) {
        // 已选方法，可扩展：复制方法名、跳转文档等
        copyToClipboard(method);
        sendNotification(`已复制方法: ${method}`, '复制成功');
      } else {
        // 默认：跳转节点
        openUrl(`https://jumper.mws.sankuai.com/terminal?hostIp=${node.ip}`);
      }
    },
  },
  {
    id: 'query_tenant_poi',
    name: '🏪 查询租户门店',
    description: '查询当前租户下的门店列表',
    requiredKeys: ['tenant'],
    icon: icon('search'),
    requiredInputs: [
      {
        key: 'poi',
        label: '门店',
        placeholder: '请选择门店',
        disableManualInput: true,
        cacheKey: (contextData: ContextData) => {
          const tenant = contextData['tenant'] as DictItem | undefined;
          return `tenant_pois:${tenant?.value ?? ''}`;
        },
        cacheTtl: 24 * 60 * 60 * 1000,
        fetchOptions: async (_query: string, contextData: ContextData): Promise<DictItem[]> => {
          const tenant = contextData['tenant'] as DictItem;
          const tenantId = tenant.value ?? '';
          try {
            const response = await http.post<{ data: { return: string } }>(
              'http://www.swiftlc.com:8080/api/octo-invoke',
              {
                params: { tenantId: parseInt(tenantId, 10), poiStatus: 1 },
                appkey: 'com.sankuai.shangou.empower.tenant',
                swimlane: '',
                methodKeyword: 'PoiThriftService#queryPoiInfoListByCondition',
              },
              { headers: { 'Content-Type': 'application/json;charset=UTF-8' } }
            );
            Logger.info('接口响应', response as object);
            const parsed = JSON.parse(response.data.return) as PoiResponse;
            if (parsed?.status?.code === 0 && parsed.poiList) {
              return parsed.poiList.map((poi) => ({
                name: poi.poiName,
                description: `门店ID: ${poi.poiId} | 地址: ${poi.poiAddress ?? '无'}`,
                value: poi as unknown as string,
              }));
            }
            return [];
          } catch (error) {
            Logger.error('获取租户门店列表失败', error as Error);
            return [];
          }
        },
      },
    ],
    action: 'query_tenant_poi_action',
    actionHandler: async (context) => {
      const poi = (context.data['poi'] as DictItem & { value: PoiInfo }).value;
      const poiInfo = JSON.stringify(poi, null, 2);
      copyToClipboard(poiInfo);
      sendNotification(`已复制门店: ${poi.poiName} 的信息`, '复制成功');
    },
  },
];

// ─── 内部类型（仅此文件使用） ──────────────────────────────────────────────────

interface MachineInfo {
  appkey?: string;
  ip: string;
  status: string;
  nodeStatus: string;
  errMsg?: string;
}

/** octo serverNodes 接口返回的单个节点结构 */
interface OctoServerNode {
  appkey: string;
  name: string;
  ip: string;
  port: number;
  version: string;
  /** 0: 正常, 其他: 异常 */
  status: number;
  cell: string;
  swimlane: string;
  properties?: Record<string, string>;
}

interface OctoServerNodesResponse {
  success: boolean;
  code: number;
  data: OctoServerNode[];
}

/** octo serviceMethods 接口响应结构 */
interface OctoServiceMethodsResponse {
  success: boolean;
  code: number;
  data: Record<string, Record<string, number>>;
}

interface PoiInfo {
  poiId: number;
  poiName: string;
  poiAddress?: string;
}

interface PoiResponse {
  status?: { code: number };
  poiList?: PoiInfo[];
}

// 合并内置功能和插件功能
const features: Feature[] = [...builtInFeatures, ...PluginManager.getFeatures()];
export default features;

