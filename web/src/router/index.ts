import { createRouter, createWebHistory } from 'vue-router'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',             redirect: '/dicts' },
    { path: '/dicts',        component: () => import('@/views/DictsView.vue') },
    { path: '/dicts/:key',   component: () => import('@/views/DictItemsView.vue') },
    { path: '/history',      component: () => import('@/views/HistoryView.vue') },
    { path: '/workspaces',   component: () => import('@/views/WorkspacesView.vue') },
    { path: '/aliases',      component: () => import('@/views/AliasesView.vue') },
    { path: '/monitor',      component: () => import('@/views/MonitorView.vue') },
  ],
})
