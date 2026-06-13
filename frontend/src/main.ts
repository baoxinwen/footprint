import { createApp } from 'vue'
import { createPinia } from 'pinia'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { Delete, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Close, Location, Suitcase, Calendar, DataAnalysis, Search, Setting, SwitchButton, Sunny, Moon, Refresh, MapLocation, Edit, Download, Share, Plus, Monitor, CircleCheck } from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// Register icons used across the app
app.component('Delete', Delete)
app.component('ArrowDown', ArrowDown)
app.component('ArrowUp', ArrowUp)
app.component('ArrowLeft', ArrowLeft)
app.component('ArrowRight', ArrowRight)
app.component('Close', Close)
app.component('Location', Location)
app.component('Suitcase', Suitcase)
app.component('Calendar', Calendar)
app.component('DataAnalysis', DataAnalysis)
app.component('Search', Search)
app.component('Setting', Setting)
app.component('SwitchButton', SwitchButton)
app.component('Sunny', Sunny)
app.component('Moon', Moon)
app.component('Refresh', Refresh)
app.component('MapLocation', MapLocation)
app.component('Edit', Edit)
app.component('Download', Download)
app.component('Share', Share)
app.component('Plus', Plus)
app.component('Monitor', Monitor)
app.component('CircleCheck', CircleCheck)

app.mount('#app')
