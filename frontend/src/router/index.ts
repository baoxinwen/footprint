import { createRouter, createWebHistory } from 'vue-router'
import { invalidateAuthSession } from '../utils/authSession'
import { TOKEN_STORAGE_KEY } from '../utils/storageKeys'
import { decodeJwtPayload } from '../utils/jwt'

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/LoginView.vue') },
  { path: '/', name: 'Map', component: () => import('../views/MapView.vue'), meta: { requiresAuth: true } },
  { path: '/trips', name: 'Trips', component: () => import('../views/TripsView.vue'), meta: { requiresAuth: true } },
  { path: '/trips/new', name: 'NewTrip', component: () => import('../views/TripFormView.vue'), meta: { requiresAuth: true } },
  { path: '/trips/:id', name: 'TripDetail', component: () => import('../views/TripDetailView.vue'), meta: { requiresAuth: true } },
  { path: '/trips/:id/edit', name: 'EditTrip', component: () => import('../views/TripFormView.vue'), meta: { requiresAuth: true } },
  { path: '/timeline', name: 'Timeline', component: () => import('../views/TimelineView.vue'), meta: { requiresAuth: true } },
  { path: '/stats', name: 'Stats', component: () => import('../views/StatsView.vue'), meta: { requiresAuth: true } },
  { path: '/settings', name: 'Settings', component: () => import('../views/SettingsView.vue'), meta: { requiresAuth: true } },
  { path: '/share/:token', name: 'Share', component: () => import('../views/ShareView.vue') },
  { path: '/share/expired', name: 'ShareExpired', component: () => import('../views/ShareExpiredView.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  if (to.meta.requiresAuth) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!token) {
      return next('/login')
    }
    // decodeJwtPayload 统一做 base64url 归一化，payload 形状变化时不再
    // 因 atob 抛错而误杀有效会话；解析失败仍按无效 token 处理
    const payload = decodeJwtPayload(token)
    if (!payload) {
      invalidateAuthSession()
      return next('/login')
    }
    if (Number(payload.exp) * 1000 < Date.now()) {
      invalidateAuthSession()
      return next('/login')
    }
  }
  next()
})

export default router
