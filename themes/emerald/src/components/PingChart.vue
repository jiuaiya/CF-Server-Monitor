<script setup lang="ts">
import type { CustomSeriesRenderItem, EChartsOption, GridComponentOption, SeriesOption, XAxisComponentOption, YAxisComponentOption } from 'echarts'
import { Icon } from '@iconify/vue'
import { useElementSize } from '@vueuse/core'
import dayjs from 'dayjs'
import { graphic } from 'echarts/core'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import LongHistoryLoginDialog from '@/components/LongHistoryLoginDialog.vue'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { getGuestMaxChartTimeRangeLabel, requiresLongHistoryLogin, showLongHistoryLoginPrompt } from '@/composables/useLongHistoryAuth'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { DEFAULT_CHART_TIME_RANGE, getAvailableChartTimeRanges } from '@/utils/chartTimeRange'
import { buildLossHeatmap, LOSS_HEATMAP_LEVELS, lossHeatmapColor } from '@/utils/pingLossHeatmap'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import { getSharedRpc, RpcError } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const nodesStore = useNodesStore()
const nodeInfo = computed(() => nodesStore.nodesByUuid.get(props.uuid))
const isDark = computed(() => appStore.isDark)
// 使用共享的 RPC 实例，避免重复创建连接
const rpc = getSharedRpc()

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.8)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.06)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 优化后的图表配色方案（多任务时使用）
const chartColors = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿色
  '#A78BFA', // 紫罗兰
  '#60A5FA', // 天蓝色
  '#FFB347', // 琥珀黄
  '#F472B6', // 粉红色
  '#34D399', // 翠绿色
  '#FB923C', // 橙色
]

// 从 publicSettings 获取记录保留时间
const maxPingRecordPreserveTime = computed(() => appStore.publicSettings?.ping_record_preserve_time || 168)

// 可用视图列表
const availableViews = computed(() => getAvailableChartTimeRanges(maxPingRecordPreserveTime.value))

// 当前选中的视图
const selectedView = ref<string>(DEFAULT_CHART_TIME_RANGE.label)
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours ?? DEFAULT_CHART_TIME_RANGE.hours
})
const lastCommittedView = ref<string>(DEFAULT_CHART_TIME_RANGE.label)

// 初始化默认视图
watch(availableViews, (views) => {
  if (!views.some(view => view.label === selectedView.value))
    selectedView.value = views[0]?.label ?? DEFAULT_CHART_TIME_RANGE.label
}, { immediate: true })

// ==================== 类型定义 ====================

interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
  loss?: number
  metric?: 'latency' | 'loss'
}

interface TaskInfo {
  id: number
  key?: string
  name: string
  interval?: number
  loss?: number
  p99?: number
  p50?: number
  p99_p50_ratio?: number
  min?: number
  max?: number
  avg?: number
  latest?: number
  total?: number
  type?: string
}

interface MetricPoint {
  time: string
  value: number | null
  tags?: Record<string, string>
  tag?: Record<string, string>
}

interface MetricSeries {
  metric_key: 'ping.latency_ms' | 'ping.loss'
  tags?: Record<string, string>
  tag?: Record<string, string>
  points: MetricPoint[]
}

interface MetricQueryResponse {
  series: MetricSeries[]
}

interface PingMetricTaskStats {
  task_id: string
  name?: string
  type?: string
  interval?: number
  loss?: number
  min?: number
  max?: number
  avg?: number
  latest?: number
  total?: number
  p50?: number
  p99?: number
  p99_p50_ratio?: number
}

interface PingMetricStatsResponse {
  stats: PingMetricTaskStats[]
}

interface PingRecordsResponse {
  records: PingRecord[]
  tasks?: TaskInfo[]
}

interface PingChartData {
  records: PingRecord[]
  tasks: TaskInfo[]
}

// 数据状态
const remoteData = shallowRef<PingRecord[]>([])
const tasks = shallowRef<TaskInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let fetchRequestId = 0
let metricRpcSupported: boolean | null = null

// 任务选择
const selectedTaskIds = ref<number[]>([])
const cutPeak = ref(false)
const showDelay = ref(true)
const showLoss = ref(false)
const chartContainer = ref<HTMLElement | null>(null)
const { width: chartWidth } = useElementSize(chartContainer)

const mergeToleranceMs = computed(() => {
  const taskIntervals = tasks.value
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60
  return Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)),
  )
})

// ==================== 数据获取 ====================

function isMethodNotFoundError(err: unknown): boolean {
  return err instanceof RpcError && err.code === -32601
}

function getMetricTaskId(series: MetricSeries, point: MetricPoint): number | null {
  const taskId = Number(
    point.tags?.task_id
    ?? series.tags?.task_id
    ?? point.tag?.task_id
    ?? series.tag?.task_id,
  )

  return Number.isInteger(taskId) ? taskId : null
}

async function fetchMetricRecords(uuid: string, hours: number): Promise<PingChartData> {
  const [metricResult, statsResult] = await Promise.all([
    rpc.getClient().call<MetricQueryResponse>('public:queryMetrics', {
      metric_keys: ['ping.latency_ms', 'ping.loss'],
      entity_id: uuid,
      hours,
      downsample: true,
      max_points: 500,
      aggregation: 'avg',
    }),
    rpc.getClient().call<PingMetricStatsResponse>('public:getPingMetricStats', {
      uuid,
      hours,
      max_points: 500,
    }),
  ])

  const records: PingRecord[] = []
  for (const series of metricResult?.series ?? []) {
    for (const point of series.points ?? []) {
      const taskId = getMetricTaskId(series, point)
      if (taskId === null)
        continue

      if (point.value === null)
        continue

      records.push({
        client: uuid,
        task_id: taskId,
        time: point.time,
        value: series.metric_key === 'ping.loss' ? -1 : point.value,
        loss: series.metric_key === 'ping.loss' ? point.value : undefined,
        metric: series.metric_key === 'ping.loss' ? 'loss' : 'latency',
      })
    }
  }

  const metricTasks = (statsResult?.stats ?? []).map(task => ({
    id: Number(task.task_id),
    name: task.name || `Ping ${task.task_id}`,
    interval: task.interval,
    loss: task.loss,
    p99: task.p99,
    p50: task.p50,
    p99_p50_ratio: task.p99_p50_ratio,
    min: task.min,
    max: task.max,
    avg: task.avg,
    latest: task.latest,
    total: task.total,
    type: task.type,
  })).filter(task => Number.isInteger(task.id))

  const fallbackTasks = Array.from(new Set(records.map(record => record.task_id)), taskId => ({
    id: taskId,
    name: `Ping ${taskId}`,
  }))

  return { records, tasks: metricTasks.length ? metricTasks : fallbackTasks }
}

async function fetchLegacyRecords(uuid: string, hours: number): Promise<PingChartData> {
  const result = await rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
    type: 'ping',
    uuid,
    hours,
  })

  return {
    records: result?.records ?? [],
    tasks: result?.tasks ?? [],
  }
}

async function fetchRecords() {
  if (!props.uuid)
    return

  const requestId = ++fetchRequestId
  const uuid = props.uuid
  const hours = selectedHours.value

  loading.value = true
  error.value = null

  try {
    let result: PingChartData
    if (metricRpcSupported === false) {
      result = await fetchLegacyRecords(uuid, hours)
    }
    else {
      try {
        result = await fetchMetricRecords(uuid, hours)
        metricRpcSupported = true
      }
      catch (err) {
        if (!isMethodNotFoundError(err))
          throw err

        metricRpcSupported = false
        result = await fetchLegacyRecords(uuid, hours)
      }
    }

    if (requestId !== fetchRequestId)
      return

    const records = result.records
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())

    remoteData.value = records
    tasks.value = result.tasks

    if (tasks.value.length > 0 && selectedTaskIds.value.length === 0) {
      selectedTaskIds.value = tasks.value.map(t => t.id)
    }
  }
  catch (err) {
    if (requestId !== fetchRequestId)
      return

    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
    tasks.value = []
  }
  finally {
    if (requestId === fetchRequestId) {
      loading.value = false
    }
  }
}

// ==================== 数据处理 ====================

const mergedData = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return []

  const toleranceMs = mergeToleranceMs.value

  const grouped: Map<number, Record<string, unknown>> = new Map()
  const anchors: number[] = []

  for (const rec of data) {
    if (rec.metric === 'loss')
      continue

    const ts = dayjs(rec.time).valueOf()
    let anchor: number | null = null

    for (const a of anchors) {
      if (Math.abs(a - ts) <= toleranceMs) {
        anchor = a
        break
      }
    }

    const useTs = anchor ?? ts
    if (!grouped.has(useTs)) {
      grouped.set(useTs, { time: dayjs(useTs).toISOString() })
      if (anchor === null) {
        anchors.push(useTs)
      }
    }

    const group = grouped.get(useTs)!
    group[rec.task_id] = rec.value < 0 ? null : rec.value
  }

  const merged = Array.from(grouped.values()).sort(
    (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
  )

  const hours = selectedHours.value
  const lastItem = merged.at(-1)
  const lastTs = lastItem ? dayjs(lastItem.time as string).valueOf() : dayjs().valueOf()
  const fromTs = lastTs - hours * 3600_000

  let startIdx = 0
  for (let i = 0; i < merged.length; i++) {
    const item = merged[i]
    if (!item)
      continue
    const ts = dayjs(item.time as string).valueOf()
    if (ts >= fromTs) {
      startIdx = Math.max(0, i - 1)
      break
    }
  }

  return merged.slice(startIdx)
})

const chartData = computed(() => {
  let data = mergedData.value
  const selectedKeys = selectedTaskIds.value.map(String)

  if (selectedKeys.length === 0)
    return []

  if (cutPeak.value) {
    data = cutPeakValues(data, selectedKeys)
  }

  if (selectedKeys.length > 0 && data.length > 0) {
    const original = data
    data = interpolateNullsLinear(data, selectedKeys, {
      maxGapMultiplier: 6,
      minCapMs: 2 * 60_000,
      maxCapMs: 30 * 60_000,
    })
    // Preserve explicit failed probes; interpolation only fills absent samples.
    data = data.map((point, index) => {
      const failedKeys = selectedKeys.filter(key => original[index]?.[key] === null)
      return failedKeys.length ? { ...point, ...Object.fromEntries(failedKeys.map(key => [key, null])) } : point
    })
  }

  return data
})

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 获取任务颜色（根据任务在完整列表中的索引）
function getTaskColor(taskId: number): string {
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

function finiteMetric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '')
    return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function average(values: number[]): number | undefined {
  if (!values.length)
    return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentile(values: number[], ratio: number): number | undefined {
  if (!values.length)
    return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function sampleIntervalSeconds(records: PingRecord[]): number | undefined {
  const timestamps = [...new Set(records.map(record => dayjs(record.time).valueOf()))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  if (timestamps.length < 2)
    return undefined

  const deltas = timestamps.slice(1)
    .map((timestamp, index) => timestamp - timestamps[index]!)
    .filter(delta => delta > 0)
    .sort((a, b) => a - b)
  if (!deltas.length)
    return undefined
  const seconds = Math.round(deltas[Math.floor(deltas.length / 2)]! / 1000)
  return seconds > 0 ? seconds : undefined
}

// 优先使用当前查询周期内的原始样本，缺少时才回退到接口聚合字段。
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  return tasks.value.map((task, idx) => {
    const taskRecords = remoteData.value.filter(record => record.task_id === task.id)
    const latencyRecords = taskRecords.filter(record => record.metric !== 'loss' && record.value >= 0)
    const latencyValues = latencyRecords.map(record => record.value)
    const lossValues = taskRecords
      .map(record => finiteMetric(record.loss))
      .filter((value): value is number => value !== undefined)
    const latest = latencyValues.at(-1)
    const p50 = percentile(latencyValues, 0.5)
    const p99 = percentile(latencyValues, 0.99)

    const safeIdx = Math.max(0, idx % chartColors.length)
    return {
      ...task,
      min: latencyValues.length ? Math.min(...latencyValues) : finiteMetric(task.min),
      max: latencyValues.length ? Math.max(...latencyValues) : finiteMetric(task.max),
      avg: average(latencyValues) ?? finiteMetric(task.avg),
      latest: latest ?? finiteMetric(task.latest),
      p50: p50 ?? finiteMetric(task.p50),
      p99: p99 ?? finiteMetric(task.p99),
      p99_p50_ratio: p50 && p99 ? p99 / p50 : finiteMetric(task.p99_p50_ratio),
      interval: sampleIntervalSeconds(latencyRecords) ?? finiteMetric(task.interval),
      loss: average(lossValues) ?? finiteMetric(task.loss),
      total: latencyRecords.length || finiteMetric(task.total),
      latestValue: latest ?? finiteMetric(task.latest) ?? null,
      color: chartColors[safeIdx]!,
    }
  })
})

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

const PING_TASK_KEYS: Record<number, string> = {
  1: 'ct',
  2: 'cu',
  3: 'cm',
  4: 'bd',
  5: 'node_1',
  6: 'node_2',
  7: 'node_3',
  8: 'node_4',
}

function appendRealtimePing(node: NonNullable<typeof nodeInfo.value>): void {
  if (selectedView.value !== DEFAULT_CHART_TIME_RANGE.label || !node.time || !node.ping)
    return

  const time = node.time
  const taskIds = tasks.value.map(task => task.id)
  const records = taskIds.flatMap((taskId) => {
    const key = tasks.value.find(task => task.id === taskId)?.key ?? PING_TASK_KEYS[taskId]
    const ping = key ? node.ping?.[key] : undefined
    if (!ping)
      return []

    return [{
      client: node.uuid,
      task_id: taskId,
      time,
      value: ping.latest >= 0 && ping.loss < 100 ? ping.latest : -1,
      loss: ping.loss,
      metric: 'latency' as const,
    }]
  })

  if (!records.length)
    return

  const recordKeys = new Set(records.map(record => `${record.task_id}:${record.time}`))
  const existing = remoteData.value.filter(record => !recordKeys.has(`${record.task_id}:${record.time}`))
  remoteData.value = [...existing, ...records]
    .sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
    .slice(-Math.max(1, tasks.value.length) * 500)
}

// 切换任务选中状态
function toggleTask(taskId: number) {
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectedTaskIds.value = []
}

// ==================== 图表配置 ====================

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 6,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 12,
    lineHeight: 20,
  },
  extraCssText: `backdrop-filter: blur(5px);z-index:9;box-shadow:0 0 0 1px ${chartThemeColors.value.tooltipShadow}, 0 0 16px ${chartThemeColors.value.tooltipShadow}`,
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

const chartLeft = computed(() => showLoss.value ? 100 : 56)
const lossHeatmap = computed(() => buildLossHeatmap(
  remoteData.value,
  selectedTasks.value.map(task => task.id),
  selectedHours.value,
  Math.max(24, Math.min(180, Math.floor(((chartWidth.value || 900) - chartLeft.value - 24) / 6))),
))
const delayHeight = 210
const lossRowHeight = 28
const lossTop = computed(() => showDelay.value ? delayHeight + 84 : 40)
const lossHeight = computed(() => Math.max(1, selectedTasks.value.length) * lossRowHeight)
const chartHeight = computed(() => showLoss.value
  ? lossTop.value + lossHeight.value + 46
  : delayHeight + 90,
)

function escapeTooltip(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#39;')
}

const pingChartOption = computed<EChartsOption>(() => {
  const taskList = selectedTasks.value
  const data = chartData.value
  const heatmap = lossHeatmap.value
  const hours = selectedHours.value
  const grids: GridComponentOption[] = []
  const xAxes: XAxisComponentOption[] = []
  const yAxes: YAxisComponentOption[] = []
  const series: SeriesOption[] = []

  function addTimeAxis(showLabels: boolean) {
    xAxes.push({
      type: 'time',
      gridIndex: grids.length - 1,
      min: heatmap.start,
      max: heatmap.end,
      splitNumber: chartWidth.value < 500 ? 3 : 6,
      axisLabel: {
        show: showLabels,
        hideOverlap: true,
        fontSize: 11,
        color: chartThemeColors.value.textSecondary,
        formatter: value => formatTime(new Date(value).toISOString(), showDateInAxis.value),
      },
      axisLine: { show: showLabels, lineStyle: { color: chartThemeColors.value.borderColor } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisPointer: { show: true, label: { formatter: params => formatTimeForTooltip(new Date(Number(params.value)).toISOString(), hours) } },
    })
  }

  if (showDelay.value) {
    grids.push({ top: 32, height: delayHeight, left: chartLeft.value, right: 24 })
    addTimeAxis(!showLoss.value)
    yAxes.push({
      type: 'value',
      gridIndex: 0,
      name: '延迟 (ms)',
      nameTextStyle: { color: chartThemeColors.value.textSecondary },
      axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chartThemeColors.value.splitLineColor, type: 'dashed' } },
    })
    for (const task of taskList) {
      series.push({
        id: `latency-${task.id}`,
        name: task.name,
        type: 'line',
        data: data.map(point => [Date.parse(point.time as string), point[task.id] as number | null ?? null]),
        smooth: cutPeak.value ? 0.6 : 0.1,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.5, color: getTaskColor(task.id), cap: 'round' },
        itemStyle: { color: getTaskColor(task.id) },
      })
    }
  }

  if (showLoss.value) {
    const gridIndex = grids.length
    grids.push({ top: lossTop.value, height: lossHeight.value, left: chartLeft.value, right: 24 })
    addTimeAxis(true)
    yAxes.push({
      type: 'category',
      gridIndex,
      inverse: true,
      data: taskList.map(task => task.name),
      axisLabel: {
        fontSize: 11,
        color: chartThemeColors.value.textSecondary,
        width: 86,
        overflow: 'truncate',
      },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: false },
      axisPointer: { show: false },
    })
    const renderItem: CustomSeriesRenderItem = (params, api) => {
      const cell = heatmap.cells[params.dataIndex]
      if (!cell)
        return
      const from = api.coord([cell.start, cell.row])
      const to = api.coord([cell.end, cell.row])
      const shape = graphic.clipRectByRect({
        x: from[0]! + 0.5,
        y: from[1]! - 11,
        width: Math.max(1, to[0]! - from[0]! - 1),
        height: 22,
      }, params.coordSys as unknown as { x: number, y: number, width: number, height: number })
      return shape ? { type: 'rect', shape, style: { fill: lossHeatmapColor(cell.maximum, isDark.value) }, emphasis: { style: { stroke: chartThemeColors.value.textSecondary, lineWidth: 1 } } } : undefined
    }
    series.push({
      id: 'loss-heatmap',
      name: '丢包率',
      type: 'custom',
      xAxisIndex: gridIndex,
      yAxisIndex: gridIndex,
      renderItem,
      clip: true,
      encode: { x: [0, 1], y: 2 },
      data: heatmap.cells.map(cell => [cell.start, cell.end, cell.row, cell.maximum ?? -1]),
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          const item = params as { dataIndex: number }
          const cell = heatmap.cells[item.dataIndex]
          if (!cell)
            return ''
          const name = escapeTooltip(taskList[cell.row]?.name ?? '')
          const time = `${formatTimeForTooltip(new Date(cell.start).toISOString(), hours)} – ${formatTimeForTooltip(new Date(cell.end).toISOString(), hours)}`
          if (cell.maximum === null)
            return `${name}<br>${time}<br>暂无数据`
          const average = cell.samples > 1 ? `<br>平均丢包 ${cell.average!.toFixed(1)}% · ${cell.samples} 次采样` : ''
          return `${name}<br>${time}<br>最高丢包 <b>${cell.maximum.toFixed(1)}%</b>${average}`
        },
      },
    })
  }

  return {
    animation: false,
    tooltip: {
      ...baseTooltipConfig.value,
      confine: true,
      triggerOn: 'mousemove|click|mousewheel',
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params]
        const latencyItems = items.flatMap((item) => {
          const value = item.value
          return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && (value[1] === null || typeof value[1] === 'number')
            ? [{ name: item.seriesName ?? '', time: value[0], latency: value[1] }]
            : []
        })
        if (!latencyItems.length)
          return ''
        const time = formatTimeForTooltip(new Date(latencyItems[0]!.time).toISOString(), hours)
        return `${time}<br>${latencyItems.map(item => `${escapeTooltip(item.name)}：${item.latency === null ? '无有效延迟' : `${Math.round(item.latency)} ms`}`).join('<br>')}`
      },
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    title: showLoss.value
      ? {
          text: '丢包率（每格最高值）',
          left: chartLeft.value,
          top: lossTop.value - 26,
          textStyle: { fontSize: 12, fontWeight: 'normal', color: chartThemeColors.value.textSecondary },
        }
      : undefined,
    legend: showDelay.value && !showLoss.value
      ? {
          type: 'scroll',
          selectedMode: false,
          bottom: 0,
          itemWidth: 12,
          itemHeight: 12,
          itemGap: 16,
          icon: 'roundRect',
          textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
          data: taskList.map(task => task.name),
        }
      : undefined,
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    series,
  }
})

// ==================== 生命周期 ====================

watch(selectedView, (label) => {
  const hours = availableViews.value.find(v => v.label === label)?.hours ?? DEFAULT_CHART_TIME_RANGE.hours
  if (requiresLongHistoryLogin(hours) && !appStore.isLoggedIn) {
    selectedView.value = lastCommittedView.value || getGuestMaxChartTimeRangeLabel()
    showLongHistoryLoginPrompt()
    return
  }
  lastCommittedView.value = label
  selectedTaskIds.value = []
  fetchRecords()
})

watch(() => props.uuid, () => {
  remoteData.value = []
  tasks.value = []
  selectedTaskIds.value = []
  fetchRecords()
})

watch(nodeInfo, (node) => {
  if (node)
    appendRealtimePing(node)
})

onMounted(() => {
  fetchRecords()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <LongHistoryLoginDialog />
    <!-- 时间选择器 -->
    <Tabs v-model="selectedView" class="w-full items-center">
      <div class="min-w-0 flex-1 overflow-x-auto pointer-events-auto">
        <TabsList :class="pickSurfaceClass('w-max h-8 bg-background/60 rounded-md', 'w-max h-8 bg-background/50 backdrop-blur-xl rounded-md')">
          <TabsTrigger
            v-for="view in availableViews" :key="view.label" :value="view.label"
            class="h-6.5 flex-none shrink-0 text-xs border-none data-[state=active]:text-emerald-600 shadow-none rounded-sm"
          >
            {{ view.label }}
          </TabsTrigger>
        </TabsList>
      </div>
      <div class="md:flex-1" />
      <div class="flex gap-2 items-center">
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
          :class="[selectedTaskIds.length === tasks.length && 'bg-background !text-emerald-600']"
          @click="showAllTasks"
        >
          全选
        </Button>
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
          :class="[!selectedTaskIds.length && 'bg-background !text-emerald-600']"
          @click="hideAllTasks"
        >
          全不选
        </Button>
      </div>
    </Tabs>

    <!-- 内容区域 -->
    <Spinner :show="loading" content-class="flex flex-col gap-4">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-8">
        <Empty description="暂无延迟数据" />
      </div>

      <template v-else>
        <!-- 最新值统计卡片（可点击切换选中状态） -->
        <div
          v-if="latestValues.length > 0" class="gap-3 grid"
          style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))"
        >
          <div
            v-for="task in latestValues" :key="task.id"
            class="flex cursor-pointer select-none items-center gap-3 rounded-md p-2 transition-all bg-background/60 hover:bg-background hover:shadow-[0_0_0_1px] hover:shadow-emerald-600/10"
            :class="[
              !selectedTaskIds.includes(task.id) && 'opacity-30',
            ]"
            :onmouseover="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = task.color)"
            :onmouseout="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = '')"
            @click="toggleTask(task.id)"
          >
            <div class="flex-1 min-w-0">
              <div class="flex gap-2 items-center">
                <div class="rounded h-4 w-1" :style="{ backgroundColor: task.color }" />
                <span class="text-sm font-semibold truncate">{{ task.name }}</span>
                <div class="flex-1" />
                <DataTooltip placement="left" content-class="!rounded p-3 w-60 backdrop-blur">
                  <Button variant="ghost" size="icon-xs" class="text-slate-500" @click.stop>
                    <Icon icon="carbon:information" :width="14" :height="14" />
                  </Button>
                  <template #content>
                    <div class="text-xs gap-x-4 gap-y-1.5 grid grid-cols-4">
                      <template v-if="task.min !== undefined">
                        <span class="text-muted-foreground">最小</span>
                        <span class="font-medium">{{ Math.round(task.min) }} ms</span>
                      </template>
                      <template v-if="task.max !== undefined">
                        <span class="text-muted-foreground">最大</span>
                        <span class="font-medium">{{ Math.round(task.max) }} ms</span>
                      </template>
                      <template v-if="task.avg !== undefined">
                        <span class="text-muted-foreground">平均</span>
                        <span class="font-medium">{{ Math.round(task.avg) }} ms</span>
                      </template>
                      <template v-if="task.latest !== undefined">
                        <span class="text-muted-foreground">最新</span>
                        <span class="font-medium">{{ Math.round(task.latest) }} ms</span>
                      </template>
                      <template v-if="task.p50 !== undefined">
                        <span class="text-muted-foreground">P50</span>
                        <span class="font-medium">{{ Math.round(task.p50) }} ms</span>
                      </template>
                      <template v-if="task.p99 !== undefined">
                        <span class="text-muted-foreground">P99</span>
                        <span class="font-medium">{{ Math.round(task.p99) }} ms</span>
                      </template>
                      <template v-if="task.p99_p50_ratio !== undefined">
                        <span class="text-muted-foreground">波动率</span>
                        <span class="font-medium">{{ task.p99_p50_ratio.toFixed(2) }}</span>
                      </template>
                      <template v-if="task.interval !== undefined">
                        <span class="text-muted-foreground">间隔</span>
                        <span class="font-medium">{{ task.interval }}s</span>
                      </template>
                      <template v-if="task.type">
                        <span class="text-muted-foreground">类型</span>
                        <span class="font-medium">{{ task.type.toUpperCase() }}</span>
                      </template>
                      <template v-if="task.total !== undefined">
                        <span class="text-muted-foreground">总数</span>
                        <span class="font-medium">{{ task.total }}</span>
                      </template>
                    </div>
                  </template>
                </DataTooltip>
              </div>
              <div class="text-xs mt-1 flex gap-1.5 items-center text-muted-foreground">
                <span class="font-medium" title="平均延迟">
                  {{ task.avg !== undefined ? `${Math.round(task.avg)}ms` : '-' }}
                </span>
                <template v-if="task.loss !== undefined">
                  <span class="opacity-60">·</span>
                  <span title="丢包率">{{ task.loss.toFixed(2) }}%</span>
                </template>
                <template v-if="task.p99_p50_ratio !== undefined">
                  <span class="opacity-60">·</span>
                  <span title="波动率">{{ task.p99_p50_ratio.toFixed(2) }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 items-center py-2">
          <!-- 延迟可视化开关 -->
          <Button
            variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
            :class="[showDelay && 'bg-background !text-emerald-600']" @click="showDelay = !showDelay"
          >
            延迟
          </Button>
          <!-- 丢包可视化开关 -->
          <Button
            variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
            :class="[showLoss && 'bg-background !text-emerald-600']" @click="showLoss = !showLoss"
          >
            丢包
          </Button>
          <!-- 平滑峰值开关 -->
          <div class="flex gap-2 items-center">
            <Button
              variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
              :class="[cutPeak && 'bg-background !text-emerald-600']" @click="cutPeak = !cutPeak"
            >
              平滑峰值
            </Button>
            <DataTooltip
              content="使用 EWMA 算法平滑数据并过滤突变值"
              placement="top"
              :content-class="pickSurfaceClass('whitespace-nowrap text-[11px]', 'whitespace-nowrap text-[11px] backdrop-blur-xl')"
            >
              <Button variant="ghost" size="icon-xs" class="text-slate-500">
                <Icon icon="carbon:information" :width="14" :height="14" />
              </Button>
            </DataTooltip>
          </div>
        </div>

        <!-- 图表 -->
        <div
          v-if="(showDelay || showLoss) && selectedTasks.length"
          class="rounded-md p-3 transition-all"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xl')"
        >
          <div ref="chartContainer" :style="{ height: `${chartHeight}px` }" data-ping-detail-chart :data-loss-rows="showLoss ? selectedTasks.length : 0">
            <VChart :option="pingChartOption" :update-options="{ notMerge: true }" autoresize />
          </div>
          <div v-if="showLoss" class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-2 text-[11px] text-muted-foreground" aria-label="丢包率颜色图例">
            <span v-for="level in LOSS_HEATMAP_LEVELS" :key="level.label" class="inline-flex items-center gap-1">
              <span class="h-2.5 w-3 rounded-[1px]" :style="{ backgroundColor: level[isDark ? 'dark' : 'light'] }" />
              {{ level.label }}
            </span>
          </div>
        </div>
        <div v-else class="py-8 text-center text-sm text-muted-foreground">
          {{ selectedTasks.length ? '请选择延迟或丢包' : '请选择探测节点' }}
        </div>
      </template>
    </Spinner>
  </div>
</template>
