<template>
  <n-config-provider :theme="null" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
    <n-dialog-provider>

    <div class="flex h-screen overflow-hidden" style="background: var(--color-bg)">

      <!-- ── 侧边栏 ── -->
      <aside
        class="flex flex-col bg-white border-r border-slate-100 shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out z-10"
        :style="{ width: collapsed ? '56px' : '216px' }"
        style="box-shadow: 2px 0 12px rgba(30,41,80,0.06)"
      >
        <!-- Logo -->
        <div class="flex items-center gap-3 h-14 px-3 border-b border-slate-100 shrink-0 overflow-hidden">
          <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm select-none"
               style="background: linear-gradient(135deg,#5b6af0 0%,#9b72f0 100%); box-shadow:0 4px 10px rgba(91,106,240,.35)">
            A
          </div>
          <span v-if="!collapsed" class="text-[13.5px] font-semibold text-slate-800 tracking-tight whitespace-nowrap">
            Alfred Console
          </span>
        </div>

        <!-- 导航 -->
        <nav class="flex-1 p-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          <button
            v-for="item in navItems" :key="item.key"
            class="flex items-center w-full gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer outline-none appearance-none bg-transparent border-0"
            :class="[
              activeMenu === item.key
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
              collapsed ? 'justify-center px-0' : ''
            ]"
            :title="collapsed ? item.label : ''"
            @click="navigate(item.key)"
          >
            <component
              :is="item.icon"
              class="shrink-0 transition-colors duration-150"
              :size="16"
              :class="activeMenu === item.key ? 'text-indigo-500' : 'text-slate-400'"
            />
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </button>
        </nav>

        <!-- 折叠按钮 -->
        <button
          class="flex items-center justify-center w-full h-10 text-slate-400 hover:bg-slate-50 hover:text-indigo-500 transition-all duration-150 shrink-0 cursor-pointer outline-none appearance-none bg-transparent border-0"
          style="border-top: 1px solid var(--color-slate-100, #f1f5f9)"
          @click="collapsed = !collapsed"
        >
          <component :is="collapsed ? ChevronRight : ChevronLeft" :size="15" />
        </button>
      </aside>

      <!-- ── 主内容 ── -->
      <main class="flex-1 overflow-y-auto p-5">
        <div class="bg-white rounded-2xl p-7"
             style="min-height: calc(100vh - 2.5rem); box-shadow: 0 2px 8px rgba(30,41,80,0.07), 0 12px 40px rgba(30,41,80,0.05); border: 1px solid rgba(210,218,238,0.8)">
          <RouterView />
        </div>
      </main>

    </div>

    </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { BookOpen, History, Layers, Zap, BarChart2, Activity, ChevronLeft, ChevronRight } from '@lucide/vue'
import type { Component } from 'vue'
import {
  NConfigProvider, NMessageProvider, NDialogProvider,
  zhCN, dateZhCN,
} from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

const router    = useRouter()
const route     = useRoute()
const collapsed = ref(false)

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor:        '#5b6af0',
    primaryColorHover:   '#7280f3',
    primaryColorPressed: '#4451d6',
    primaryColorSuppl:   '#5b6af0',
    borderRadius:        '8px',
    borderRadiusSmall:   '6px',
    fontFamily:          '"Inter", ui-sans-serif, system-ui, sans-serif',
    fontSize:            '13.5px',
    fontSizeMedium:      '13.5px',
    fontSizeSmall:       '12.5px',
    textColor1:          '#111827',
    textColor2:          '#374151',
    textColor3:          '#9ca3af',
  },
  DataTable: {
    thColor:       '#f8fafc',
    thColorHover:  '#f1f4fb',
    tdColorHover:  '#f5f6ff',
    borderColor:   '#e8ecf4',
    thTextColor:   '#6b7280',
    tdTextColor:   '#374151',
    thFontWeight:  '600',
    fontSize:      '13px',
  },
  Input: {
    borderRadius:   '8px',
    border:         '1px solid #e2e8f0',
    borderFocus:    '1px solid #5b6af0',
    borderHover:    '1px solid #a5adde',
    boxShadowFocus: '0 0 0 3px rgba(91,106,240,0.12)',
    color:          '#fff',
    colorFocus:     '#fff',
  },
  Button: {
    borderRadiusMedium: '8px',
    borderRadiusSmall:  '6px',
    borderRadiusTiny:   '5px',
  },
  Tag: {
    borderRadius:   '6px',
    fontSizeMedium: '11.5px',
    fontSizeSmall:  '11px',
  },
  Dialog: { borderRadius: '14px' },
  Modal:  { borderRadius: '14px', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' },
  PageHeader: { titleFontSize: '17px' },
}

interface NavItem { key: string; label: string; icon: Component }

const navItems: NavItem[] = [
  { key: 'dicts',      label: '字典管理', icon: BookOpen  },
  { key: 'history',    label: '历史记录', icon: History   },
  { key: 'workspaces', label: '工作区',   icon: Layers    },
  { key: 'aliases',    label: '别名',     icon: Zap       },
  { key: 'context',    label: '上下文',   icon: Activity  },
  { key: 'monitor',    label: '监控',     icon: BarChart2 },
]

const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/dicts'))      return 'dicts'
  if (p.startsWith('/history'))    return 'history'
  if (p.startsWith('/workspaces')) return 'workspaces'
  if (p.startsWith('/aliases'))    return 'aliases'
  if (p.startsWith('/context'))    return 'context'
  if (p.startsWith('/monitor'))    return 'monitor'
  return 'dicts'
})

function navigate(key: string) { router.push('/' + key) }
</script>
