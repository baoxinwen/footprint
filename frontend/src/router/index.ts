import { createRouter, createWebHistory } from 'vue-router'

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
    const token = localStorage.getItem('token')
    if (!token) {
      return next('/login')
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('token')
        return next('/login')
      }
    } catch {
      localStorage.removeItem('token')
      return next('/login')
    }
  }
  next()
})

export default router
