import type { MaybeRefOrGetter } from 'vue'
import type { PingHistoryPoint } from '@/stores/nodes'
import type { BackendPingDisplay, PingKey } from '@/utils/backendPingDisplay'
import type { NodeStatusPing } from '@/utils/rpc'
import { computed, toValue } from 'vue'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
import { useNodesStore } from '@/stores/nodes'
import { selectBackendPingKeys } from '@/utils/backendPingDisplay'
import { formatDateTime } from '@/utils/helper'
import { getPingToneClass } from '@/utils/nodeHelper'

export type NodePingMetric = 'latency' | 'loss'

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

interface UseNodePingDisplayOptions {
  enabled?: MaybeRefOrGetter<boolean>
  loadingDisplayText?: string
  emptyDisplayText?: string
  loadingPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  emptyPanelTooltipText?: Partial<Record<NodePingMetric, string>>
}

function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-emerald-600/90'
  if (latency <= 120)
    return 'bg-green-500/80'
  if (latency <= 180)
    return 'bg-lime-400/80'
  if (latency <= 240)
    return 'bg-yellow-400/80'
  return 'bg-rose-500/80'
}

function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-emerald-600/90'
  if (loss <= 3)
    return 'bg-green-500/80'
  if (loss <= 6)
    return 'bg-lime-400/80'
  if (loss <= 9)
    return 'bg-yellow-400/80'
  return 'bg-rose-500/80'
}

export interface TopPingNetwork {
  key: PingKey
  name: string
  latency: string
  loss: string
  toneClass: string
  lossToneClass: string
  tooltip: string
}

function segmentPingHistory(points: PingHistoryPoint[]) {
  if (!points.length)
    return []
  const barCount = Math.min(NODE_PING_BAR_COUNT, points.length)
  const firstTime = Date.parse(points[0]!.time)
  const lastTime = Date.parse(points.at(-1)!.time)
  const segmentSize = Math.max(1, (lastTime - firstTime) / barCount)
  return Array.from({ length: barCount }, (_, index) => {
    const start = firstTime + index * segmentSize
    const end = index === barCount - 1 ? lastTime + 1 : start + segmentSize
    return {
      time: new Date(start).toISOString(),
      points: points.filter((point) => {
        const time = Date.parse(point.time)
        return time >= start && time < end
      }),
    }
  })
}

/** Each target uses its own measurements; a summary average never fills a missing target. */
export function buildTargetPingBars(history: PingHistoryPoint[], key: PingKey, name: string, metric: NodePingMetric = 'latency'): NodePingBar[] {
  const bars = segmentPingHistory(history).map((segment, index) => {
    const samples = segment.points.flatMap(point => point.targets?.[key] ? [point.targets[key]] : [])
    const latencies = samples.flatMap(sample => sample.latency !== null ? [sample.latency] : [])
    const losses = samples.flatMap(sample => sample.loss !== null ? [sample.loss] : [])
    const latency = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null
    const loss = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : null
    const timedOut = loss !== null && loss >= 100
    const text = metric === 'loss'
      ? loss !== null ? `丢包 ${loss.toFixed(1)}%` : '丢包 N/A'
      : timedOut ? '超时' : latency !== null ? `${Math.round(latency)} ms` : 'N/A'
    return {
      key: `${key}-${metric}-${segment.time}-${index}`,
      className: metric === 'loss'
        ? loss !== null ? getLossToneClass(loss) : 'bg-muted-foreground/15'
        : timedOut ? 'bg-rose-500/80' : latency !== null ? getLatencyToneClass(latency) : 'bg-muted-foreground/15',
      tooltip: `${name}\n${formatDateTime(segment.time, 'HH:mm:ss')}\n${text}${metric === 'latency' && loss !== null ? ` · 丢包 ${loss.toFixed(1)}%` : ''}`,
    }
  })
  const empty = Array.from({ length: NODE_PING_BAR_COUNT - bars.length }, (_, index) => ({
    key: `${key}-${metric}-empty-${index}`,
    className: 'bg-muted-foreground/10',
    tooltip: `${name}\n暂无历史数据`,
  }))
  return [...empty, ...bars]
}

/** Card and list results share the backend's per-server priority and count. */
export function buildTopPingNetworks(ping?: Record<string, NodeStatusPing>, display?: BackendPingDisplay): TopPingNetwork[] {
  return selectBackendPingKeys(display, Object.keys(ping ?? {})).map((key) => {
    const entry = ping?.[key]
    const name = display?.names?.[key] || entry?.name || key
    const latency = entry?.latest ?? -1
    const available = latency >= 0 && (entry?.loss ?? 100) < 100
    const text = available ? `${Math.round(latency)} ms` : '超时'
    const loss = entry?.loss
    const validLoss = typeof loss === 'number' && Number.isFinite(loss) && loss >= 0
    const lossText = validLoss ? `${loss.toFixed(1)}%` : '-'
    return {
      key,
      name,
      latency: text,
      loss: lossText,
      toneClass: getPingToneClass(latency, available),
      lossToneClass: !validLoss ? 'text-muted-foreground' : loss > 9 ? 'text-rose-500' : loss > 3 ? 'text-yellow-600' : 'text-emerald-600',
      tooltip: `${name}\nPing ${text} · 丢包 ${lossText}`,
    }
  })
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  const nodesStore = useNodesStore()
  const summaryVisible = computed(() => {
    const node = nodesStore.nodesByUuid.get(toValue(uuid))
    return Boolean(node && selectBackendPingKeys(node.pingDisplay, Object.keys(node.ping ?? {})).length)
  })
  // Home-card samples are appended by the shared subscribe=all WebSocket.
  const pingStatsEnabled = computed(() => options.enabled === undefined || toValue(options.enabled))

  const pingStats = useNodePingStats(uuid, {
    enabled: pingStatsEnabled,
  })

  /**
   * 将配置窗口按时间平均划分为 NODE_PING_BAR_COUNT 根柱子，
   * 每根柱取段内数据点的平均值（无论段内几条数据）。
   */
  function buildPingBars(metric: NodePingMetric): NodePingBar[] {
    const points = pingStats.history.value
    if (!points.length)
      return []

    const bars: NodePingBar[] = []
    for (const [index, segment] of segmentPingHistory(points).entries()) {
      const segmentPoints = segment.points

      const latencyValues = segmentPoints
        .map(point => point.latency)
        .filter((value): value is number => value !== null)
      const lossValues = segmentPoints
        .map(point => point.loss)
        .filter((value): value is number => value !== null)

      const value = metric === 'latency'
        ? latencyValues.length
          ? latencyValues.reduce((sum, v) => sum + v, 0) / latencyValues.length
          : null
        : lossValues.length
          ? lossValues.reduce((sum, v) => sum + v, 0) / lossValues.length
          : null
      const segmentTime = segment.time

      bars.push({
        key: `${segmentTime}-${index}`,
        className: value === null
          ? 'bg-muted-foreground/15'
          : metric === 'latency'
            ? getLatencyToneClass(value)
            : getLossToneClass(value),
        tooltip: value === null
          ? `${formatDateTime(segmentTime, 'HH:mm:ss')} N/A`
          : metric === 'latency'
            ? `${formatDateTime(segmentTime, 'HH:mm:ss')}\n${Math.round(value)} ms`
            : `${formatDateTime(segmentTime, 'HH:mm:ss')}\n${value.toFixed(1)}%`,
      })
    }

    return bars
  }

  function buildEmptyPingBars(metric: NodePingMetric): NodePingBar[] {
    const tooltip = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value
        ? '加载失败'
        : !pingStatsEnabled.value
            ? '未启用记录'
            : metric === 'latency'
              ? 'N/A'
              : 'N/A'

    return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip,
    }))
  }

  const latencyBars = computed(() => buildPingBars('latency'))
  const lossBars = computed(() => buildPingBars('loss'))
  function padBars(bars: NodePingBar[], metric: NodePingMetric): NodePingBar[] {
    return [...buildEmptyPingBars(metric).slice(0, NODE_PING_BAR_COUNT - bars.length), ...bars]
  }
  const latencyRenderBars = computed(() => padBars(latencyBars.value, 'latency'))
  const lossRenderBars = computed(() => padBars(lossBars.value, 'loss'))

  const latencyDisplay = computed(() => {
    if (pingStats.hasLatencyData.value)
      return `${Math.round(pingStats.avgLatency.value)} ms`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const lossDisplay = computed(() => {
    if (pingStats.hasLossData.value)
      return `${pingStats.avgLoss.value.toFixed(1)}%`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const latencyPanelTooltip = computed(() => {
    if (!pingStats.hasLatencyData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.latency ?? ''
      return options.emptyPanelTooltipText?.latency ?? ''
    }
    return `平均延迟 ${Math.round(pingStats.avgLatency.value)} ms`
  })

  const lossPanelTooltip = computed(() => {
    if (!pingStats.hasLossData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.loss ?? ''
      return options.emptyPanelTooltipText?.loss ?? ''
    }

    const volatility = pingStats.avgVolatility.value > 0
      ? `，平均波动 ${pingStats.avgVolatility.value.toFixed(2)}`
      : ''
    return `平均丢包 ${pingStats.avgLoss.value.toFixed(1)}%${volatility}`
  })

  return {
    summaryVisible,
    pingStats,
    pingStatsEnabled,
    latencyRenderBars,
    lossRenderBars,
    latencyDisplay,
    lossDisplay,
    latencyPanelTooltip,
    lossPanelTooltip,
  }
}
