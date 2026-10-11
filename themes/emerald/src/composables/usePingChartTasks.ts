import type { MaybeRefOrGetter } from 'vue'
import type { NodeData } from '@/stores/nodes'
import type { BackendPingDisplay, PingKey } from '@/utils/backendPingDisplay'
import type { NodeStatusPing } from '@/utils/rpc'
import { computed, ref, toValue, watch } from 'vue'
import { normalizeBackendPingDisplay, PING_KEYS, selectBackendPingKeys } from '@/utils/backendPingDisplay'

export interface PingChartTask {
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

/** Use the same current slots as the home card, keeping historical metric ids stable. */
export function buildPingChartTasks(historyTasks: PingChartTask[], ping?: Record<string, NodeStatusPing>, display?: BackendPingDisplay): PingChartTask[] {
  const byKey = new Map<PingKey, PingChartTask>()
  for (const task of historyTasks) {
    const key = PING_KEYS.includes(task.key as PingKey) ? task.key as PingKey : PING_KEYS[task.id - 1]
    if (key)
      byKey.set(key, task)
  }
  const normalized = normalizeBackendPingDisplay(display)
  const available = ping === undefined ? [...byKey.keys()] : Object.keys(ping)
  return selectBackendPingKeys(normalized, available).map((key) => {
    const task = byKey.get(key)
    return {
      ...task,
      id: task?.id ?? PING_KEYS.indexOf(key) + 1,
      key,
      name: normalized.names?.[key] || ping?.[key]?.name || task?.name || key,
    }
  })
}

export function usePingChartTasks(historyTasks: MaybeRefOrGetter<PingChartTask[]>, node: MaybeRefOrGetter<Pick<NodeData, 'ping' | 'pingDisplay'> | undefined>) {
  const tasks = computed(() => {
    const current = toValue(node)
    return buildPingChartTasks(toValue(historyTasks), current?.ping, current?.pingDisplay)
  })
  const selectedTaskIds = ref<number[]>([])
  const selectedTasks = computed(() => tasks.value.filter(task => selectedTaskIds.value.includes(task.id)))

  watch(() => tasks.value.map(task => task.id).join(','), (_, previous) => {
    const previousIds = new Set(previous?.split(',').map(Number))
    const selected = new Set(selectedTaskIds.value)
    // Preserve manual filters on refresh; select newly configured slots and remove disabled ones.
    selectedTaskIds.value = tasks.value
      .filter(task => selected.has(task.id) || !previousIds.has(task.id))
      .map(task => task.id)
  }, { immediate: true, flush: 'sync' })

  return { tasks, selectedTaskIds, selectedTasks }
}
