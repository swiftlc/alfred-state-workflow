import PluginManager from '../core/PluginManager';
import {http} from '../core/HttpClient';
import Logger from '../core/Logger';
import CacheManager from '../core/CacheManager';
import {copyToClipboard, openUrl, sendNotification} from '../core/utils';
import type {ContextData, DictItem, Feature} from '../types';

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
  },
  {
    id: 'jump_qnh_management',
    name: '🌐 牵牛花M端跳转',
    description: '',
    requiredKeys: ['swimlane'],
    action: 'jump_qnh_management',
  },
  {
    id: 'jump_qnh',
    name: '🌐 牵牛花跳转',
    description: '',
    requiredKeys: ['swimlane'],
    action: 'jump_qnh',
  },
  {
    id: 'switch_env',
    name: '切换环境',
    description: '切换当前工作环境',
    requiredKeys: ['swimlane'],
    requiredInputs: [
      {
        key: 'ak',
        label: 'appkey',
        placeholder: '请输入或选择appkey',
        fetchOptions: async (_query: string, _contextData: ContextData): Promise<DictItem[]> => {
          return [
            { name: 'com.sankuai.waimai.app', description: '外卖主App' },
            { name: 'com.sankuai.meituan.app', description: '美团主App' },
            { name: 'com.sankuai.dianping.app', description: '点评主App' },
          ];
        },
      },
      {
        key: 'branch',
        label: '分支名',
        placeholder: '请输入要切换的分支名',
      },
    ],
    action: 'switch_env',
  },
  {
    id: 'copy_dict_value',
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
    name: (data: ContextData) =>
      `📝 修改描述：${(data['_currentDict'] as DictItem | undefined)?.name ?? ''}: ${(data['_currentSelected'] as DictItem | undefined)?.name ?? ''}`,
    description: (data: ContextData) =>
      `当前描述：${(data['_currentSelected'] as DictItem | undefined)?.description ?? ''}`,
    requiredKeys: [],
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
    actionHandler: async (context) => {
      Logger.info(`修改描述：${JSON.stringify(context)}`);
      const currentSelected = context.data['_currentSelected'] as DictItem;
      const currentDict = context.data['_currentDict'] as DictItem;
      const input1 = context.data['input1'] as DictItem;

      await http.put('http://127.0.0.1:8083/dictionaries', {
        categoryKey: currentDict.key,
        title: currentSelected.name,
        description: input1.value,
      }, {
        headers: { 'Content-Type': 'application/json' },
      });
      sendNotification('修改成功！', '修改成功');
    },
  },
  {
    id: 'view_swimlane_machines',
    name: '🖥️ 泳道机器查看',
    description: '查看当前泳道下的机器状态',
    requiredKeys: ['swimlane'],
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
        fetchOptions: async (_query: string, contextData: ContextData): Promise<DictItem[]> => {
          const swimlane = contextData['swimlane'] as DictItem;
          const stackUuid = swimlane.description ?? '';

          return CacheManager.get<DictItem[]>(
            `swimlane_machines:${stackUuid}`,
            async () => {
              try {
                const proxyDest = `https://dev.sankuai.com/gateway/cargo/api/stack?type=runners_octo_status&stack_uuid=${stackUuid}`;
                const response = await http.get<{ data?: Record<string, MachineInfo> }>(
                  'http://www.swiftlc.com/api/sso',
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      'x-proxy-dest': proxyDest,
                    },
                  }
                );
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
            60 * 1000
          ) as Promise<DictItem[]>;
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
    id: 'query_tenant_poi',
    name: '🏪 查询租户门店',
    description: '查询当前租户下的门店列表',
    requiredKeys: ['tenant'],
    requiredInputs: [
      {
        key: 'poi',
        label: '门店',
        placeholder: '请选择门店',
        disableManualInput: true,
        fetchOptions: async (_query: string, contextData: ContextData): Promise<DictItem[]> => {
          const tenant = contextData['tenant'] as DictItem;
          const tenantId = tenant.value ?? '';

          return CacheManager.get<DictItem[]>(
            `tenant_pois:${tenantId}`,
            async () => {
              try {
                let response = await http.post<{ data: { return: string } }>(
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
            24 * 60 * 60 * 1000
          ) as Promise<DictItem[]>;
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

