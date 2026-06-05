<template>
  <n-config-provider :theme="darkTheme" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
    <n-dialog-provider>
    <n-layout has-sider style="height: 100vh">
      <n-layout-sider
        bordered
        collapse-mode="width"
        :collapsed-width="64"
        :width="200"
        :collapsed="collapsed"
        show-trigger
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <div style="padding: 16px 12px 8px; font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden;">
          <span v-if="!collapsed">Alfred Console</span>
          <span v-else>AC</span>
        </div>
        <n-menu
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="22"
          :options="menuOptions"
          :value="activeMenu"
          @update:value="navigate"
        />
      </n-layout-sider>
      <n-layout>
        <n-layout-content style="padding: 24px; height: 100vh; overflow-y: auto">
          <RouterView />
        </n-layout-content>
      </n-layout>
    </n-layout>
    </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NConfigProvider, NMessageProvider, NDialogProvider,
  NLayout, NLayoutSider, NLayoutContent, NMenu,
  darkTheme, zhCN, dateZhCN,
} from 'naive-ui'
import type { MenuOption } from 'naive-ui'

const router = useRouter()
const route  = useRoute()
const collapsed = ref(false)

const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/dicts'))      return 'dicts'
  if (p.startsWith('/history'))    return 'history'
  if (p.startsWith('/workspaces')) return 'workspaces'
  if (p.startsWith('/aliases'))    return 'aliases'
  if (p.startsWith('/monitor'))    return 'monitor'
  return 'dicts'
})

const icon = (emoji: string) => () => h('span', { style: 'font-size:16px' }, emoji)

const menuOptions: MenuOption[] = [
  { label: '字典管理', key: 'dicts',      icon: icon('📚') },
  { label: '历史记录', key: 'history',    icon: icon('📜') },
  { label: '工作区',   key: 'workspaces', icon: icon('🗂') },
  { label: '别名',     key: 'aliases',    icon: icon('🏷') },
  { label: '监控',     key: 'monitor',    icon: icon('📊') },
]

function navigate(key: string) {
  router.push('/' + key)
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #18181c; }
</style>
