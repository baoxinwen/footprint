import { createRouter, createWebHistory } from 'vue-router'
import { invalidateAuthSession } from '../utils/authSession'
import { TOKEN_STORAGE_KEY } from '../utils/storageKeys'
import { decodeJwtPayload } from '../utils/jwt'

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/LoginView.vue'), meta: { title: '登录' } },
  { path: '/', name: 'Map', component: () => import('../views/MapView.vue'), meta: { requiresAuth: true, title: '地图' } },
  { path: '/trips', name: 'Trips', component: () => import('../views/TripsView.vue'), meta: { requiresAuth: true, title: '旅行' } },
  { path: '/trips/new', name: 'NewTrip', component: () => import('../views/TripFormView.vue'), meta: { requiresAuth: true, title: '新建旅行' } },
  { path: '/trips/:id', name: 'TripDetail', component: () => import('../views/TripDetailView.vue'), meta: { requiresAuth: true, title: '旅行详情' } },
  { path: '/trips/:id/edit', name: 'EditTrip', component: () => import('../views/TripFormView.vue'), meta: { requiresAuth: true, title: '编辑旅行' } },
  { path: '/timeline', name: 'Timeline', component: () => import('../views/TimelineView.vue'), meta: { requiresAuth: true, title: '时间线' } },
  { path: '/stats', name: 'Stats', component: () => import('../views/StatsView.vue'), meta: { requiresAuth: true, title: '统计' } },
  { path: '/settings', name: 'Settings', component: () => import('../views/SettingsView.vue'), meta: { requiresAuth: true, title: '设置' } },
  { path: '/share/:token', name: 'Share', component: () => import('../views/ShareView.vue'), meta: { title: '旅行分享' } },
  { path: '/share/expired', name: 'ShareExpired', component: () => import('../views/ShareExpiredView.vue'), meta: { title: '链接已过期' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  // SPA 路由切换对读屏静默，至少让文档标题跟随视图（WCAG 2.4.2）
  if (to.meta.title) {
    document.title = `${to.meta.title} · 旅行足迹`
  }
  if (to.meta.requiresAuth) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!token) {
      return next('/login')
    }
    // decodeJwtPayload 统一做 base64url 归一化，payload 形状变化时不再
    // 因 atob 抛错而误杀有效会话；解析失败仍按无效 token 处理
    const payload = decodeJwtPayload(token)
    if (!payload) {
      // 令牌过期与 401 同语义：只清 token，草稿按 JWT sub 键控保留，
      // 重新登录后可恢复未提交内容（评审 I-8，与 request.ts 的 401 路径对齐）
      invalidateAuthSession({ clearDrafts: false })
      return next('/login')
    }
    if (Number(payload.exp) * 1000 < Date.now()) {
      invalidateAuthSession({ clearDrafts: false })
      return next('/login')
    }
  }
  next()
})

export default router
