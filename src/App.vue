<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, CloudSun, Cpu, Droplets, Fan, Gauge, House, LayoutDashboard, Leaf, Lightbulb, MapPin, Menu, Pause, Play, Radio, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sprout, Sun, Thermometer, Timer, Wifi, Wind, X, Zap } from 'lucide-vue-next'
import DeviceArt from './components/DeviceArt.vue'

type Nav = 'overview' | 'environment' | 'devices' | 'logs'
type Log = { id: number; time: string; kind: 'device' | 'system' | 'environment'; title: string; detail: string; tag: string }
type DeviceKey = 'fan' | 'water' | 'light' | 'shade'
type Devices = Record<DeviceKey, boolean>
type Stored = { house?: string; devices?: Record<string, Devices>; modes?: Record<string, string>; tempMin?: number; tempMax?: number; humidityMin?: number; humidityMax?: number }
let saved: Stored = {}
try { saved = JSON.parse(localStorage.getItem('qinghe-settings') || '{}') } catch { /* Ignore corrupt storage. */ }
const nav = ref<Nav>('overview')
const navItems = [{ key: 'overview', label: '大棚总览', icon: LayoutDashboard }, { key: 'environment', label: '环境监测', icon: Activity }, { key: 'devices', label: '设备管理', icon: Cpu }, { key: 'logs', label: '运行日志', icon: BookOpen }] as const
const houses = [{ id: '01', name: '01 号智慧大棚', crop: '樱桃番茄', area: '1,280', plants: '1,840', day: 42 }, { id: '02', name: '02 号育苗大棚', crop: '奶油生菜', area: '960', plants: '2,400', day: 18 }, { id: '03', name: '03 号生态大棚', crop: '甜椒', area: '1,560', plants: '1,600', day: 36 }]
const houseId = ref(houses.some(h => h.id === saved.house) ? saved.house! : '01')
const house = computed(() => houses.find(h => h.id === houseId.value)!)
const states = ref<Record<string, Devices>>(Object.fromEntries(houses.map(h => [h.id, { fan: true, water: false, light: false, shade: true, ...saved.devices?.[h.id] }])))
const modes = ref<Record<string, string>>(Object.fromEntries(houses.map(h => [h.id, saved.modes?.[h.id] || 'auto'])))
const devices = computed(() => states.value[houseId.value]!)
const mode = computed({ get: () => modes.value[houseId.value]!, set: (v: string) => { modes.value[houseId.value] = v; addLog('device', '控制模式已切换', `已切换为${v === 'auto' ? '自动' : '手动'}控制模式`, '模式切换'); notify(`已切换为${v === 'auto' ? '自动' : '手动'}控制模式`) } })
const paused = ref(false)
const mobileOpen = ref(false)
const clock = ref(new Date())
const lastUpdate = ref(new Date())
const temperature = ref(26.4)
const humidity = ref(68.2)
const light = ref(12860)
const co2 = ref(426)
const soil = ref(65.8)
const cpuTemp = ref(42.8)
const cpu = ref(23)
const memory = ref(31)
const tempMin = ref(saved.tempMin ?? 18)
const tempMax = ref(saved.tempMax ?? 30)
const humidityMin = ref(saved.humidityMin ?? 50)
const humidityMax = ref(saved.humidityMax ?? 80)
const tempDraftMin = ref(tempMin.value)
const tempDraftMax = ref(tempMax.value)
const humidityDraftMin = ref(humidityMin.value)
const humidityDraftMax = ref(humidityMax.value)
const formError = ref('')
const dialog = ref<'settings' | 'help' | 'pi' | 'plc' | null>(null)
const manualOverrideUntil: Record<string, number> = {}
let previousFocus: HTMLElement | null = null
const noticesOpen = ref(false)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout>
let refreshTimer: ReturnType<typeof setInterval>
let clockTimer: ReturnType<typeof setInterval>
let nextId = 20
const refreshing = ref(false)
const range = ref('24h')
const metric = ref<'temperature' | 'humidity'>('temperature')
const logTab = ref('all')
const logSearch = ref('')
const page = ref(1)
const dateChoice = ref('today')
const logs = ref<Log[]>([])
const logsByHouse: Record<string, Log[]> = {}
const shortTime = (date: Date) => date.toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
const dateLabel = computed(() => clock.value.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).replaceAll('/', '.'))
const weekLabel = computed(() => clock.value.toLocaleDateString('zh-CN', { weekday: 'long', timeZone: 'Asia/Shanghai' }))
const healthy = computed(() => temperature.value >= tempMin.value && temperature.value <= tempMax.value && humidity.value >= humidityMin.value && humidity.value <= humidityMax.value)
const activeCount = computed(() => Object.values(devices.value).filter(Boolean).length)
const deviceItems = [{ key: 'fan', name: '循环风机', subtitle: '保持空气流通', icon: Fan }, { key: 'water', name: '滴灌水泵', subtitle: '精准水分补给', icon: Droplets }, { key: 'light', name: '植物补光灯', subtitle: '补充生长光照', icon: Lightbulb }, { key: 'shade', name: '遮阳帘', subtitle: '智能调节光照', icon: Sun }] as const
const filteredLogs = computed(() => logs.value.filter(l => (logTab.value === 'all' || l.kind === logTab.value) && (!logSearch.value || `${l.title}${l.detail}${l.tag}`.includes(logSearch.value.trim())) && (dateChoice.value !== 'hour' || clock.value.getTime() - l.id < 3600000)))
const totalPages = computed(() => Math.max(1, Math.ceil(filteredLogs.value.length / 7)))
const pagedLogs = computed(() => filteredLogs.value.slice((page.value - 1) * 7, page.value * 7))
const previewLogs = computed(() => logs.value.filter(l => logTab.value === 'all' || l.kind === logTab.value).slice(0, 4))
const samples = ref(Array.from({ length: 25 }, (_, i) => 22 + Math.sin(i / 4 - 2) * 2.8 + i * .13 + Math.random() * 1.5))
const chartPoints = computed(() => {
  const count = range.value === '1h' ? 13 : range.value === '7d' ? 21 : 25
  return Array.from({ length: count }, (_, i) => {
    const source = samples.value[(i + (range.value === '1h' ? 10 : 0)) % samples.value.length]!
    const value = metric.value === 'temperature' ? source : 66 + (source - 24) * 2.4
    const y = metric.value === 'temperature' ? 144 - (value - 15) / 20 * 130 : 144 - (value - 40) / 50 * 130
    return { x: 38 + i / (count - 1) * 650, y, value }
  })
})
const chartLine = computed(() => chartPoints.value.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '))
const chartArea = computed(() => `${chartLine.value} L 688 149 L 38 149 Z`)
const chartLabels = computed(() => range.value === '1h' ? ['00 分', '10 分', '20 分', '30 分', '40 分', '50 分', '60 分'] : range.value === '7d' ? Array.from({ length: 7 }, (_, i) => { const d = new Date(clock.value); d.setDate(d.getDate() - 6 + i); return `${d.getMonth() + 1}/${d.getDate()}` }) : ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'])
const hoveredPoint = ref<number | null>(null)
const plotTitle = computed(() => metric.value === 'temperature' ? '温度' : '湿度')
const plotUnit = computed(() => metric.value === 'temperature' ? '°C' : '%')
function notify(message: string) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 3300) }
function addLog(kind: Log['kind'], title: string, detail: string, tag: string) { logs.value.unshift({ id: Date.now() + nextId++, time: shortTime(new Date()), kind, title, detail, tag }); logs.value = logs.value.slice(0, 100) }
function seedLogs() {
  const list: [Log['kind'], string, string, string][] = [
    ['environment', '环境数据采集完成', '温度、湿度等 4 项传感器数据已同步', '数据采集'],
    ['device', '循环风机已启动', '自动策略 · 棚内温度达到预设阈值', '自动控制'],
    ['device', '遮阳帘已展开', '自动策略 · 光照强度达到 12,000 lx', '自动控制'],
    ['system', '设备连接正常', '树莓派与 PLC 通信链路稳定', '系统状态'],
    ['device', '定时滴灌已完成', '滴灌水泵运行 10 分钟，用水 32 L', '定时任务'],
    ['system', '今日数据归档完成', '已保存 2,880 条环境监测数据', '数据归档'],
    ['environment', '土壤湿度恢复正常', '土壤含水率 65.8%，处于适宜范围', '环境监测'],
    ['device', '植物补光灯已关闭', '自然光照充足，自动关闭补光', '自动控制'],
  ]
  logs.value = list.map((l, i) => ({ id: Date.now() - i * 420000, time: shortTime(new Date(Date.now() - i * 420000)), kind: l[0], title: l[1], detail: l[2], tag: l[3] }))
}
function refresh(manual = false, force = false) {
  if (paused.value && !manual && !force) return
  const offset = (Number(houseId.value) - 1) * .7
  temperature.value = +(26.4 + offset + (Math.random() - .5) * 1.4).toFixed(1)
  humidity.value = +(68.2 - offset * 2 + (Math.random() - .5) * 3).toFixed(1)
  light.value = Math.round(12860 + (Math.random() - .5) * 1200)
  co2.value = Math.round(426 + (Math.random() - .5) * 24)
  soil.value = +(65.8 + (Math.random() - .5) * 2).toFixed(1)
  cpuTemp.value = +(42.8 + (Math.random() - .5) * 2).toFixed(1)
  cpu.value = Math.round(23 + (Math.random() - .5) * 12)
  lastUpdate.value = new Date()
  samples.value = [...samples.value.slice(1), temperature.value]
  if (mode.value === 'auto' && Date.now() > (manualOverrideUntil[houseId.value] ?? 0)) {
    const desired: Devices = { fan: temperature.value > tempMax.value - 5, water: soil.value < 55, light: light.value < 6000, shade: light.value > 12000 }
    for (const item of deviceItems) {
      if (devices.value[item.key] !== desired[item.key]) {
        devices.value[item.key] = desired[item.key]
        addLog('device', `${item.name}已${desired[item.key] ? '开启' : '关闭'}`, `${house.value.name} · 自动策略根据最新环境数据执行`, '自动控制')
      }
    }
  }
  if (manual) { refreshing.value = true; addLog('environment', '手动刷新环境数据', `${house.value.name} · 所有传感器数据已更新`, '手动刷新'); notify('环境与设备数据已更新'); setTimeout(() => refreshing.value = false, 650) }
}
function toggleDevice(key: DeviceKey) {
  devices.value[key] = !devices.value[key]
  manualOverrideUntil[houseId.value] = Date.now() + 30000
  const name = deviceItems.find(d => d.key === key)!.name
  addLog('device', `${name}已${devices.value[key] ? '开启' : '关闭'}`, `${house.value.name} · 手动操作，指令执行成功`, '手动控制')
  notify(`${name}已${devices.value[key] ? '开启' : '关闭'}（模拟执行）`)
}
function openSettings() { tempDraftMin.value = tempMin.value; tempDraftMax.value = tempMax.value; humidityDraftMin.value = humidityMin.value; humidityDraftMax.value = humidityMax.value; formError.value = ''; dialog.value = 'settings' }
function saveSettings() {
  if (![tempDraftMin.value, tempDraftMax.value, humidityDraftMin.value, humidityDraftMax.value].every(Number.isFinite) || tempDraftMin.value < -10 || tempDraftMax.value > 60 || tempDraftMin.value >= tempDraftMax.value || humidityDraftMin.value < 0 || humidityDraftMax.value > 100 || humidityDraftMin.value >= humidityDraftMax.value) { formError.value = '请填写有效范围：温度 -10～60°C，湿度 0～100%，且下限小于上限。'; return }
  tempMin.value = tempDraftMin.value; tempMax.value = tempDraftMax.value; humidityMin.value = humidityDraftMin.value; humidityMax.value = humidityDraftMax.value
  addLog('system', '环境预警阈值已更新', `温度 ${tempMin.value}～${tempMax.value}°C，湿度 ${humidityMin.value}～${humidityMax.value}%`, '参数设置'); dialog.value = null; notify('环境预警阈值已保存')
}
function exportData() {
  const rows = nav.value === 'logs' ? [['时间', '类型', '事件', '详情'], ...filteredLogs.value.map(l => [l.time, l.tag, l.title, l.detail])] : [['大棚', '采集时间', '温度(°C)', '空气湿度(%)', '光照(lx)', 'CO2(ppm)', '土壤湿度(%)'], [house.value.name, `${dateLabel.value} ${shortTime(lastUpdate.value)}`, temperature.value, humidity.value, light.value, co2.value, soil.value]]
  const csv = '\uFEFF' + rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `青禾-${house.value.name}-${nav.value === 'logs' ? '运行日志' : '环境报告'}-${dateLabel.value}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('CSV 文件已导出')
}
function go(key: Nav) { nav.value = key; mobileOpen.value = false; logTab.value = 'all'; page.value = 1 }
function keydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { dialog.value = null; noticesOpen.value = false; mobileOpen.value = false }
  if (e.key === 'Tab' && dialog.value) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.modal button, .modal input, .modal select, .modal a[href]')).filter(el => !el.hasAttribute('disabled'))
    const first = elements[0], last = elements[elements.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }
}
watch(dialog, async value => { if (value) { previousFocus = document.activeElement as HTMLElement; await nextTick(); document.querySelector<HTMLElement>('.modal input, .modal button')?.focus() } else { previousFocus?.focus() } })
watch([houseId, states, modes, tempMin, tempMax, humidityMin, humidityMax], () => { try { localStorage.setItem('qinghe-settings', JSON.stringify({ house: houseId.value, devices: states.value, modes: modes.value, tempMin: tempMin.value, tempMax: tempMax.value, humidityMin: humidityMin.value, humidityMax: humidityMax.value })) } catch { /* Storage is optional. */ } }, { deep: true })
watch(houseId, (newId, oldId) => { logsByHouse[oldId] = logs.value; logs.value = logsByHouse[newId] ?? []; if (!logs.value.length) seedLogs(); refresh(false, true); page.value = 1; notify(`已切换至${house.value.name}`) })
watch([logTab, logSearch, dateChoice], () => page.value = 1)
watch(metric, () => hoveredPoint.value = null)
onMounted(() => { seedLogs(); refreshTimer = setInterval(() => refresh(), 5000); clockTimer = setInterval(() => clock.value = new Date(), 1000); document.addEventListener('keydown', keydown) })
onUnmounted(() => { clearInterval(refreshTimer); clearInterval(clockTimer); clearTimeout(toastTimer); document.removeEventListener('keydown', keydown) })
</script>

<template>
  <div class="app-shell">
    <div v-if="mobileOpen" class="sidebar-scrim" @click="mobileOpen = false"></div>
    <aside class="sidebar" :class="{ open: mobileOpen }">
      <a class="brand" href="#" @click.prevent="go('overview')"><span class="brand-mark"><Sprout :size="25" :stroke-width="1.8" /></span><span><strong>青禾<span class="brand-dot">.</span></strong><small>QINGHE SMART FARM</small></span></a>
      <div class="workspace-label">农场工作空间 <span>PRO</span></div>
      <div class="farm-select"><span class="farm-symbol"><House :size="19" /></span><div><strong>青禾生态农场</strong><small>智慧种植 · 生长有方</small></div><ChevronDown :size="14" /></div>
      <div class="nav-label">工作台</div>
      <nav class="nav-list" aria-label="主导航"><button v-for="item in navItems" :key="item.key" :class="{ active: nav === item.key }" @click="go(item.key)"><component :is="item.icon" :size="19" :stroke-width="1.7" /><span>{{ item.label }}</span><span v-if="item.key === 'devices'" class="nav-count">6</span><span v-if="nav === item.key" class="active-dot"></span></button></nav>
      <div class="sidebar-bottom"><div class="nature-card"><div class="nature-icon"><Leaf :size="24" :stroke-width="1.4" /></div><strong>让科技，亲近自然。</strong><p>每一份用心<br />都在悄悄生长。</p><span>GROW WITH CARE <ArrowUpRight :size="12" /></span></div><button class="bottom-nav" @click="openSettings"><Settings2 :size="18" />系统设置</button><button class="bottom-nav" @click="dialog = 'help'"><CircleHelp :size="18" />帮助与支持<ArrowUpRight :size="13" /></button><div class="user-profile"><span class="avatar">林</span><div><strong>林间农场主</strong><small>农场管理员</small></div><span class="user-online"></span></div></div>
    </aside>

    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" aria-label="打开导航" @click="mobileOpen = true"><Menu :size="20" /></button><span>农场工作空间</span><ChevronRight :size="13" /><strong>{{ navItems.find(n => n.key === nav)?.label }}</strong></div><div class="topbar-right"><span class="top-date">{{ dateLabel }} <span>{{ weekLabel }}</span></span><span class="top-divider"></span><div class="notice-wrap"><button class="icon-button notification-button" aria-label="查看通知" :aria-expanded="noticesOpen" @click="noticesOpen = !noticesOpen"><Bell :size="19" /><i></i></button><div v-if="noticesOpen" class="notification-popover"><div class="popover-title">农场消息<span class="badge muted">2 条</span></div><p><ShieldCheck :size="19" /><span><strong>所有设备连接正常</strong><small>系统已完成设备健康检查</small></span></p><p><Sprout :size="19" /><span><strong>{{ house.crop }}进入生长第 {{ house.day }} 天</strong><small>保持适宜温湿度，关注植株生长</small></span></p><span class="popover-foot">模拟通知 · 仅用于界面演示</span></div></div><span class="top-avatar">林</span></div></header>

      <main>
        <section class="page-heading"><div><div class="eyebrow">GROWING A BETTER TOMORROW</div><h1>{{ nav === 'overview' ? '数字大棚' : navItems.find(n => n.key === nav)?.label }}<span class="heading-dot">.</span></h1><p>{{ nav === 'overview' ? '看见每一刻生长，让种植更从容。' : nav === 'environment' ? '感知环境的细微变化，守护作物的每一天。' : nav === 'devices' ? '设备协同，让每一项指令精准到位。' : '记录每一次变化，让农场运行有迹可循。' }}</p></div><div class="heading-actions"><span class="live-indicator" :class="{ inactive: paused }"><i></i>{{ paused ? '更新已暂停' : '实时数据' }}</span><button class="button button-white export-button" @click="exportData"><ArrowDownToLine :size="16" />导出{{ nav === 'logs' ? '日志' : '报告' }}</button></div></section>

        <section v-if="nav === 'overview'" class="hero-card"><div class="hero-photo"></div><div class="hero-shade"></div><div class="hero-copy"><div class="hero-badge"><span></span> 连接自然，智见未来</div><h2>好的生长，<br />每一刻都在发生。</h2><p>从一粒种子，到一片丰收。青禾与您一同守护。</p></div><div class="hero-weather"><CloudSun :size="30" :stroke-width="1.4" /><span><b>24°</b><small>晴转多云 · 东南风 2 级</small></span></div><div class="hero-location"><MapPin :size="13" />青禾生态农场 · 智慧种植示范区</div><div class="hero-pills"><span><Sprout :size="14" />生态种植</span><span><ShieldCheck :size="14" />智慧守护</span></div></section>

        <section class="section-toolbar"><div class="house-picker"><House :size="19" /><select v-model="houseId" aria-label="选择大棚"><option v-for="h in houses" :key="h.id" :value="h.id">{{ h.name }}</option></select><ChevronDown :size="14" /><span class="badge" :class="{ warning: !healthy }"><span class="tiny-dot"></span>{{ healthy ? '运行正常' : '环境预警' }}</span></div><div class="toolbar-right"><span class="update-label">更新于 {{ shortTime(lastUpdate) }}</span><button class="icon-button" :aria-label="paused ? '恢复实时更新' : '暂停实时更新'" @click="paused = !paused; notify(paused ? '实时数据更新已暂停' : '已恢复实时数据更新')"><Play v-if="paused" :size="15" /><Pause v-else :size="15" /></button><button class="icon-button" aria-label="刷新数据" @click="refresh(true)"><RefreshCw :size="16" :class="{ rotating: refreshing }" /></button></div></section>

        <section v-if="nav === 'overview'" class="farm-stats"><div><span class="stat-icon"><Sprout :size="19" /></span><span><small>当前作物</small><strong>{{ house.crop }}<em class="growth-chip">生长期</em></strong></span></div><div><span class="stat-icon"><House :size="19" /></span><span><small>种植面积</small><strong class="number">{{ house.area }}<em>m²</em></strong></span></div><div><span class="stat-icon"><Leaf :size="19" /></span><span><small>在棚植株</small><strong class="number">{{ house.plants }}<em>株</em></strong></span></div><div><span class="stat-icon"><Timer :size="19" /></span><span><small>已生长</small><strong class="number">{{ house.day }}<em>天</em><span class="growth-note">距离丰收更近一步</span></strong></span></div></section>

        <div v-if="nav === 'overview' || nav === 'devices'" class="overview-grid" :class="{ 'devices-layout': nav === 'devices' }">
          <section v-if="nav === 'overview'" class="card environment-card"><div class="card-heading"><h2><span class="title-square"></span>实时环境报告</h2><button class="text-icon" aria-label="设置环境阈值" @click="openSettings"><SlidersHorizontal :size="17" /></button></div><div class="env-main-metrics"><div class="env-metric"><span class="metric-name"><Thermometer :size="16" />空气温度</span><div class="metric-value number">{{ temperature.toFixed(1) }}<span>°C</span></div><div class="metric-range"><span class="range-dot" :class="{ amber: temperature < tempMin || temperature > tempMax }"></span>{{ temperature >= tempMin && temperature <= tempMax ? '温度适宜' : '超出范围' }}<small>{{ tempMin }}–{{ tempMax }}°C</small></div><svg class="sparkline" viewBox="0 0 150 30"><path d="M0 25L10 22L20 24L30 15L40 19L50 17L60 19L70 9L80 13L90 6L100 10L110 8L120 13L130 8L140 10L150 3" fill="none" stroke="#769d66" stroke-width="1.6"/></svg></div><div class="env-metric"><span class="metric-name"><Droplets :size="16" />空气湿度</span><div class="metric-value number">{{ humidity.toFixed(1) }}<span>%</span></div><div class="metric-range"><span class="range-dot" :class="{ amber: humidity < humidityMin || humidity > humidityMax }"></span>{{ humidity >= humidityMin && humidity <= humidityMax ? '湿度适宜' : '超出范围' }}<small>{{ humidityMin }}–{{ humidityMax }}%</small></div><svg class="sparkline" viewBox="0 0 150 30"><path d="M0 10L10 14L20 10L30 15L40 12L50 20L60 15L70 19L80 11L90 15L100 8L110 13L120 9L130 11L140 7L150 10" fill="none" stroke="#83a9bc" stroke-width="1.6"/></svg></div></div><div class="env-secondary"><div><span><Sun :size="16" />光照强度</span><strong class="number">{{ light.toLocaleString() }}<small>lx</small></strong></div><div><span><Wind :size="16" />CO₂ 浓度</span><strong class="number">{{ co2 }}<small>ppm</small></strong></div></div><div class="card-foot"><span class="tiny-dot" :class="{ amber: !healthy }"></span>{{ healthy ? '作物生长环境良好' : '环境超出预设阈值，请检查' }}<button @click="go('environment')">查看详情<ArrowUpRight :size="13" /></button></div></section>

          <section class="card device-card"><div class="card-heading"><h2><span class="device-heading-icon"><Cpu :size="18" /></span>树莓派 5B</h2><span class="badge"><span class="tiny-dot"></span>在线</span></div><div class="device-caption">边缘计算网关 <span>Raspberry Pi 5 · 8GB</span></div><div class="device-visual"><span class="device-visual-label">EDGE GATEWAY</span><DeviceArt kind="pi" /><span class="device-floating-badge"><Wifi :size="10" /> 已连接</span></div><div class="pi-stat-row"><div><small>CPU 温度</small><strong class="number">{{ cpuTemp.toFixed(1) }}<em>°C</em></strong></div><div><small>CPU 使用率</small><strong class="number">{{ cpu }}<em>%</em></strong></div><div><small>内存使用</small><strong class="number">{{ memory }}<em>%</em></strong></div></div><div class="resource-bar"><i :style="{ width: `${cpu}%` }"></i></div><div class="device-card-foot"><span><span class="tiny-dot"></span>已稳定运行 12 天 08 时</span><button aria-label="查看树莓派设备详情" @click="dialog = 'pi'"><ArrowUpRight :size="16" /></button></div></section>

          <section class="card device-card plc-card"><div class="card-heading"><h2><span class="device-heading-icon"><Gauge :size="18" /></span>PLC 控制器</h2><span class="badge"><span class="tiny-dot"></span>运行中</span></div><div class="device-caption">工业级智能控制 <span>S7-200 SMART</span></div><div class="device-visual plc-visual"><span class="device-visual-label">INDUSTRIAL CONTROL</span><DeviceArt kind="plc" /><span class="device-floating-badge"><span class="tiny-dot"></span> RUN</span></div><div class="plc-stats"><div><small>输入通道</small><strong class="number">12<span>DI</span></strong></div><div><small>输出通道</small><strong class="number">8<span>DO</span></strong></div><span class="plc-protocol"><span class="tiny-dot"></span>Modbus TCP<br /><small>通信正常 · 12 ms</small></span></div><div class="device-card-foot"><span><ShieldCheck :size="13" />{{ activeCount }} 台执行设备正在运行</span><button aria-label="查看 PLC 设备详情" @click="dialog = 'plc'"><ArrowUpRight :size="16" /></button></div></section>
        </div>

        <section v-if="nav !== 'logs'" class="card controls-card"><div class="controls-heading"><div><h2><Zap :size="17" />快捷控制</h2><span>设备状态，一目了然</span></div><div class="control-mode"><span>控制模式</span><select v-model="mode" aria-label="切换控制模式"><option value="auto">自动模式</option><option value="manual">手动模式</option></select><ChevronDown :size="12" /></div></div><div class="controls-list"><div v-for="d in deviceItems" :key="d.key" class="control-item"><span class="control-device-icon" :class="{ running: devices[d.key] }"><component :is="d.icon" :size="21" :stroke-width="1.6" :class="{ 'fan-running': d.key === 'fan' && devices.fan }" /></span><div class="control-label"><strong>{{ d.name }}</strong><small :class="{ 'running-text': devices[d.key] }">{{ devices[d.key] ? d.key === 'shade' ? '已展开' : '运行中' : '已关闭' }}</small></div><button class="switch" :class="{ on: devices[d.key] }" role="switch" :aria-checked="devices[d.key]" :aria-label="`${d.name}开关`" @click="toggleDevice(d.key)"><span></span></button></div></div><p v-if="mode === 'auto' && nav === 'devices'" class="auto-note"><Radio :size="14" />自动模式按预设阈值执行；手动操作立即生效并保持 30 秒，之后恢复自动策略。</p></section>

        <div v-if="nav === 'overview' || nav === 'environment'" class="bottom-grid" :class="{ 'environment-layout': nav === 'environment' }">
          <section class="card chart-card"><div class="card-heading"><h2><span class="title-square"></span>环境变化趋势</h2><div class="segment range-segment"><button v-for="r in [{ key: '1h', label: '近 1 小时' }, { key: '24h', label: '近 24 小时' }, { key: '7d', label: '近 7 天' }]" :key="r.key" :class="{ selected: range === r.key }" @click="range = r.key; hoveredPoint = null">{{ r.label }}</button></div></div><div class="chart-meta"><div class="chart-legend"><button :class="{ active: metric === 'temperature' }" @click="metric = 'temperature'"><span class="legend-dot"></span>空气温度</button><button :class="{ active: metric === 'humidity' }" @click="metric = 'humidity'"><span class="legend-dot blue"></span>空气湿度</button></div><span>{{ range === '24h' ? '今日' : range === '1h' ? '最近一小时' : '最近七天' }}平均 <strong class="number">{{ (chartPoints.reduce((s, p) => s + p.value, 0) / chartPoints.length).toFixed(1) }}{{ plotUnit }}</strong></span></div><div class="chart-wrap"><span class="chart-unit">{{ plotTitle }} ({{ plotUnit }})</span><svg class="trend-chart" viewBox="0 0 714 180" role="img" :aria-label="`${plotTitle}变化趋势图`" @mouseleave="hoveredPoint = null"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop :stop-color="metric === 'temperature' ? '#c3d9a9' : '#a7c8da'" stop-opacity=".45"/><stop offset="1" :stop-color="metric === 'temperature' ? '#c3d9a9' : '#a7c8da'" stop-opacity=".02"/></linearGradient></defs><g v-for="(y, i) in [19, 51.5, 84, 116.5, 149]" :key="i"><line x1="38" :y1="y" x2="688" :y2="y" stroke="#edf0ea" stroke-dasharray="3 4"/><text x="24" :y="y + 4" text-anchor="end" fill="#a1a69e" font-size="10">{{ metric === 'temperature' ? 35 - i * 5 : 90 - i * 12.5 }}</text></g><path :d="chartArea" fill="url(#chart-fill)"/><path :d="chartLine" :stroke="metric === 'temperature' ? '#6c8f50' : '#6e9eb9'" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" fill="none"/><text v-for="(label, i) in chartLabels" :key="label" :x="38 + i / 6 * 650" y="172" text-anchor="middle" fill="#a1a69e" font-size="10">{{ label }}</text><g v-for="(point, i) in chartPoints" :key="i" @mouseenter="hoveredPoint = i"><rect :x="point.x - 650 / (chartPoints.length - 1) / 2" y="10" :width="650 / (chartPoints.length - 1)" height="140" fill="transparent"/><template v-if="hoveredPoint === i"><line :x1="point.x" y1="15" :x2="point.x" y2="149" stroke="#bac6b3" stroke-dasharray="3 3"/><circle :cx="point.x" :cy="point.y" r="4" fill="#fff" stroke="#6c8f50" stroke-width="2"/><rect :x="Math.min(620, Math.max(38, point.x - 32))" :y="Math.max(0, point.y - 30)" width="68" height="23" rx="5" fill="#234536"/><text :x="Math.min(620, Math.max(38, point.x - 32)) + 34" :y="Math.max(0, point.y - 30) + 15" text-anchor="middle" fill="#fff" font-size="10">{{ point.value.toFixed(1) }}{{ plotUnit }}</text></template></g></svg></div><div class="chart-footer"><span><Clock3 :size="12" />{{ range === '24h' ? '每小时聚合一次' : range === '1h' ? '每 5 分钟聚合一次' : '每日聚合一次' }}</span><span>数据来源：环境传感器 <span class="demo-label">模拟</span></span></div></section>

          <section v-if="nav === 'overview'" class="card activity-card"><div class="card-heading"><h2><span class="title-square"></span>运行日志</h2><button class="text-button" @click="go('logs')">查看全部<ArrowUpRight :size="13" /></button></div><div class="log-mini-tabs"><button v-for="t in [{ key: 'all', label: '全部' }, { key: 'device', label: '设备' }, { key: 'system', label: '系统' }]" :key="t.key" :class="{ active: logTab === t.key }" @click="logTab = t.key">{{ t.label }}</button><span class="log-live-dot"></span></div><div class="activity-list"><div v-for="(log, i) in previewLogs" :key="log.id" class="activity-item"><span class="timeline-dot" :class="{ first: i === 0 }"></span><div><strong>{{ log.title }}</strong><p>{{ log.detail }}</p></div><time>{{ log.time.slice(0, 5) }}</time></div><p v-if="!previewLogs.length" class="empty-state">暂无相关日志</p></div><div class="activity-foot"><span class="tiny-dot"></span>所有操作均已安全记录</div></section>

          <section v-if="nav === 'environment'" class="environment-summary"><div class="card sensor-reading" v-for="s in [{ name: '空气温度', value: temperature.toFixed(1), unit: '°C', icon: Thermometer, range: `${tempMin}–${tempMax}°C`, percentage: temperature / 40 * 100 }, { name: '空气湿度', value: humidity.toFixed(1), unit: '%', icon: Droplets, range: `${humidityMin}–${humidityMax}%`, percentage: humidity }, { name: '光照强度', value: light.toLocaleString(), unit: 'lx', icon: Sun, range: '5,000–30,000 lx', percentage: light / 30000 * 100 }, { name: '土壤湿度', value: soil.toFixed(1), unit: '%', icon: Sprout, range: '50–75%', percentage: soil }]" :key="s.name"><div class="sensor-top"><component :is="s.icon" :size="20" /><span>{{ s.name }}</span><span class="badge muted">实时</span></div><strong class="number">{{ s.value }}<small>{{ s.unit }}</small></strong><div class="sensor-progress"><span :style="{ width: `${Math.min(100, s.percentage)}%` }"></span></div><p>适宜范围 <span>{{ s.range }}</span></p></div></section>
        </div>

        <section v-if="nav === 'devices'" class="card device-table-card"><div class="card-heading"><h2><span class="title-square"></span>执行设备列表</h2><span class="subtle-text">4 台设备 · 连接正常</span></div><div class="table-scroll"><table><thead><tr><th>设备名称</th><th>设备编号</th><th>连接方式</th><th>当前状态</th><th>所属控制器</th><th>操作</th></tr></thead><tbody><tr v-for="(d, i) in deviceItems" :key="d.key"><td><component :is="d.icon" :size="17" />{{ d.name }}</td><td class="number">QH-{{ houseId }}-{{ String(i + 1).padStart(3, '0') }}</td><td>数字输出 DO{{ i }}</td><td><span class="badge" :class="{ muted: !devices[d.key] }"><span class="tiny-dot"></span>{{ devices[d.key] ? '运行中' : '待机' }}</span></td><td>S7-200 SMART</td><td><button class="text-button" @click="toggleDevice(d.key)">{{ devices[d.key] ? '关闭设备' : '开启设备' }}</button></td></tr></tbody></table></div></section>

        <section v-if="nav === 'logs'" class="card full-log-card"><div class="full-log-toolbar"><div class="log-filter-tabs"><button v-for="t in [{ key: 'all', label: '全部日志' }, { key: 'environment', label: '环境监测' }, { key: 'device', label: '设备控制' }, { key: 'system', label: '系统事件' }]" :key="t.key" :class="{ active: logTab === t.key }" @click="logTab = t.key">{{ t.label }}</button></div><div class="log-filters"><label class="search-input"><Search :size="16" /><input v-model="logSearch" placeholder="搜索日志内容" aria-label="搜索日志内容" /></label><select v-model="dateChoice" class="date-select" aria-label="日志时间范围"><option value="today">今天</option><option value="hour">最近一小时</option></select></div></div><div class="table-scroll"><table class="logs-table"><thead><tr><th>时间</th><th>事件类型</th><th>事件名称</th><th>详细信息</th><th>状态</th></tr></thead><tbody><tr v-for="l in pagedLogs" :key="l.id"><td class="number">{{ l.time }}</td><td><span class="type-tag" :class="l.kind">{{ l.tag }}</span></td><td>{{ l.title }}</td><td class="log-detail">{{ l.detail }}</td><td><span class="success-text"><Check :size="13" />成功</span></td></tr></tbody></table></div><div v-if="!pagedLogs.length" class="empty-state large"><Search :size="30" /><h3>没有找到相关日志</h3><p>试试其他关键词，或切换日志类型。</p></div><div class="pagination"><span>共 {{ filteredLogs.length }} 条记录</span><div><button class="icon-button" aria-label="上一页" :disabled="page <= 1" @click="page--"><ChevronLeft :size="16" /></button><span>{{ page }} / {{ totalPages }}</span><button class="icon-button" aria-label="下一页" :disabled="page >= totalPages" @click="page++"><ChevronRight :size="16" /></button></div></div></section>

        <footer class="page-footer"><span><span class="tiny-dot"></span>系统运行稳定<span class="footer-separator">·</span>数据每 5 秒自动更新<span class="demo-label">模拟数据</span></span><span>青禾 QINGHE <span class="footer-separator">/</span>让每一寸生长都有迹可循</span></footer>
      </main>
    </div>

    <Transition name="toast"><div v-if="toast" role="status" class="toast-message"><span><Check :size="15" /></span>{{ toast }}</div></Transition>
    <div v-if="dialog" class="modal-backdrop" @click.self="dialog = null"><section class="modal" role="dialog" aria-modal="true" :aria-label="dialog === 'settings' ? '环境参数设置' : dialog === 'help' ? '帮助与支持' : '设备详情'"><button class="modal-close icon-button" aria-label="关闭弹窗" @click="dialog = null"><X :size="20" /></button>
      <template v-if="dialog === 'settings'"><div class="modal-symbol"><SlidersHorizontal :size="25" /></div><h2>环境参数设置</h2><p class="modal-description">为作物设置舒适的生长环境，超出范围时显示预警。</p><form @submit.prevent="saveSettings"><label class="field-label">空气温度范围 <span>°C</span></label><div class="range-inputs"><label><small>最低温度</small><input v-model.number="tempDraftMin" type="number" min="-10" max="59" step="0.1" required /></label><span>—</span><label><small>最高温度</small><input v-model.number="tempDraftMax" type="number" min="-9" max="60" step="0.1" required /></label></div><label class="field-label">空气湿度范围 <span>%</span></label><div class="range-inputs"><label><small>最低湿度</small><input v-model.number="humidityDraftMin" type="number" min="0" max="99" step="0.1" required /></label><span>—</span><label><small>最高湿度</small><input v-model.number="humidityDraftMax" type="number" min="1" max="100" step="0.1" required /></label></div><p v-if="formError" class="form-error">{{ formError }}</p><p class="settings-note"><ShieldCheck :size="16" />设置保存在当前浏览器，刷新页面后依然有效。</p><div class="modal-actions"><button type="button" class="button button-white" @click="dialog = null">取消</button><button type="submit" class="button button-green"><Check :size="16" />保存设置</button></div></form></template>
      <template v-else-if="dialog === 'help'"><div class="modal-symbol"><Sprout :size="28" /></div><h2>欢迎使用青禾</h2><p class="modal-description">你的农场，尽在掌握。</p><div class="help-item"><Activity :size="20" /><div><strong>实时环境监测</strong><p>传感器模拟数据每 5 秒更新，可暂停、手动刷新，或切换大棚。</p></div></div><div class="help-item"><Zap :size="20" /><div><strong>便捷设备控制</strong><p>点击开关即可模拟启停设备，操作自动写入运行日志。</p></div></div><div class="help-item"><ArrowDownToLine :size="20" /><div><strong>记录与导出</strong><p>在运行日志中搜索、筛选事件，支持导出 CSV 文件。</p></div></div><div class="help-demo"><span class="demo-label">演示模式</span>所有数据与控制均为本地模拟，未连接真实硬件。</div><button class="button button-green full-width" @click="dialog = null">开始照料我的农场<ArrowRight :size="16" /></button></template>
      <template v-else><div class="modal-symbol"><Cpu v-if="dialog === 'pi'" :size="26" /><Gauge v-else :size="26" /></div><h2>{{ dialog === 'pi' ? '树莓派 5B' : 'PLC 控制器' }}</h2><p class="modal-description">{{ dialog === 'pi' ? 'Raspberry Pi 5 · 8GB · 边缘计算网关' : 'Siemens S7-200 SMART · 工业控制器' }}</p><DeviceArt :kind="dialog === 'pi' ? 'pi' : 'plc'" /><dl class="device-details"><template v-for="detail in dialog === 'pi' ? [['设备状态', '在线 · 运行正常'], ['IP 地址', `192.168.${Number(houseId)}.10`], ['处理器', 'Broadcom BCM2712 · 4 核'], ['系统版本', 'Raspberry Pi OS · 64 位'], ['CPU 温度', `${cpuTemp}°C`], ['内存使用', '2.48 GB / 8 GB'], ['已运行时间', '12 天 08 小时']] : [['设备状态', 'RUN · 运行正常'], ['IP 地址', `192.168.${Number(houseId)}.20`], ['设备型号', 'CPU ST20 · DC/DC/DC'], ['通信协议', 'Modbus TCP · 502'], ['数字输入', '12 路 DI'], ['数字输出', '8 路 DO'], ['当前通信延迟', '12 ms']]" :key="detail[0]"><dt>{{ detail[0] }}</dt><dd>{{ detail[1] }}</dd></template></dl><div class="help-demo"><span class="demo-label">模拟设备</span>设备信息为演示数据。</div><button class="button button-green full-width" @click="dialog = null">完成</button></template>
    </section></div>
  </div>
</template>
