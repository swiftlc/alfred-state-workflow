/**
 * 参数预设配置
 *
 * 当 Octo 接口的参数类型在此 map 中匹配（取短类名，如 "UserAccessContext"），
 * 且该参数在 API 模板返回中为空时，用此预设自动填充。
 *
 * ctx 由 OctoView 注入调用时的动态上下文（如 tenantId）。
 */

export interface PresetCtx {
  tenantId?: string | number
}

export type PresetFn = (ctx: PresetCtx) => object

export const PARAM_PRESETS: Record<string, PresetFn> = {
  UserAccessContext: (ctx) => ({
    accountId:    83704,
    empId:        10048724,
    authProvider: '',
    cliPlugIn:    '',
    accountName:  'majian22',
    appId:        3,
    empName:      '马健',
    accountType:  null,
    tenantId:     ctx.tenantId ? Number(ctx.tenantId) : 1013029,
    userAgent:    '',
    source:       null,
  }),
}
