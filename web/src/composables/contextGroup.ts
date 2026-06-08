import type { InjectionKey } from 'vue'

export interface GroupItemDef {
  contextKey: string
  getValue:   () => string
  label?:     string
}

export interface ContextGroupInjection {
  registerItem:   (def: GroupItemDef) => void
  unregisterItem: (contextKey: string) => void
  openBatch:      (mode: 'apply' | 'copy') => void
  copyAll:        () => void
  itemCount:      () => number
}

export const CTX_GROUP_KEY: InjectionKey<ContextGroupInjection> = Symbol('ctxGroup')
