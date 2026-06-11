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
    { path: '/context',      component: () => import('@/views/ContextView.vue') },
    { path: '/lion',         component: () => import('@/views/LionConfigView.vue'), meta: { keepAlive: true, componentName: 'LionConfigView' } },
    { path: '/shepherd',     component: () => import('@/views/ShepherdView.vue'), meta: { keepAlive: true, componentName: 'ShepherdView' } },
    { path: '/octo',         component: () => import('@/views/OctoView.vue'),    meta: { keepAlive: true, componentName: 'OctoView' } },
    { path: '/mafka',        component: () => import('@/views/MafkaView.vue'),  meta: { keepAlive: true, componentName: 'MafkaView' } },
    { path: '/lowcode',      component: () => import('@/views/LowCodeView.vue'), meta: { keepAlive: true, componentName: 'LowCodeView' } },
  ],
})
