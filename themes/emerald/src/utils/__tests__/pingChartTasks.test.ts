import type { PingChartTask } from '@/composables/usePingChartTasks'
import type { BackendPingDisplay } from '@/utils/backendPingDisplay'
import type { NodeStatusPing } from '@/utils/rpc'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { buildTopPingNetworks } from '@/composables/useNodePingDisplay'
import { buildPingChartTasks, usePingChartTasks } from '@/composables/usePingChartTasks'
import { adaptServer, fetchPingHistory, fetchSiteConfigs } from '@/utils/api'
import { PING_KEYS } from '@/utils/backendPingDisplay'
import { buildPacketLossEvents } from '@/utils/pingLossEvents'

const priority = ['node_4', 'bd', 'cu', 'node_1', 'cm', 'node_2', 'ct', 'node_3'] as const
const historyTasks: PingChartTask[] = PING_KEYS.map((key, index) => ({ id: index + 1, key, name: `旧名称${index + 1}`, avg: index * 10 }))
const ping: Record<string, NodeStatusPing> = Object.fromEntries(PING_KEYS.map((key, index) => [key, { name: `当前名称${index + 1}`, latest: index * 10, loss: 0 }]))
const display: BackendPingDisplay = { order: [...priority], count: 3, enabled: [...PING_KEYS], names: { node_4: '上海移动', bd: '广州电信' } }

afterEach(() => vi.unstubAllGlobals())

describe('ping detail follows the current backend selection', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('matches the home card count, order and names for %i slots without reassigning ids', (count) => {
    const configured = { ...display, count }
    const tasks = buildPingChartTasks([...historyTasks].reverse(), ping, configured)
    const home = buildTopPingNetworks(ping, configured)
    expect(tasks.map(task => [task.key, task.name])).toEqual(home.map(task => [task.key, task.name]))
    expect(tasks.map(task => task.id)).toEqual(priority.slice(0, count).map(key => PING_KEYS.indexOf(key) + 1))
    expect(tasks[0]).toMatchObject({ id: 8, avg: 70, name: '上海移动' })
  })

  it('excludes disabled historical slots from both tasks and loss events, including all-disabled', () => {
    const tasks = buildPingChartTasks(historyTasks, ping, { ...display, enabled: ['ct', 'node_2', 'node_3'] })
    expect(tasks.map(task => task.id)).toEqual([6, 1, 7])
    const records = historyTasks.map(task => ({ task_id: task.id, time: '2026-10-11T01:00:00Z', value: -1, loss: 100 }))
    expect(buildPacketLossEvents(records, tasks, 1).events.map(event => event.taskId)).toEqual([6, 1, 7])
    expect(buildPingChartTasks(historyTasks, ping, { ...display, enabled: [] })).toEqual([])
  })

  it('keeps newly configured slots even before their first history record and uses stable legacy ids', () => {
    const tasks = buildPingChartTasks([{ id: 4, name: '旧 BGP', avg: 40 }], ping, { ...display, count: 2 })
    expect(tasks).toEqual([
      { id: 8, key: 'node_4', name: '上海移动' },
      { id: 4, key: 'bd', name: '广州电信', avg: 40 },
    ])
  })

  it('uses live availability for old backends and does not restore historical-only slots', () => {
    const current = { node_4: ping.node_4!, cu: ping.cu! }
    expect(buildPingChartTasks(historyTasks, current).map(task => task.key)).toEqual(['cu', 'node_4'])
    expect(buildPingChartTasks(historyTasks, {}).map(task => task.key)).toEqual([])
    expect(buildPingChartTasks(historyTasks).map(task => task.key)).toEqual(['ct', 'cu', 'cm'])
  })

  it('preserves manual filters across live and history refreshes while applying configuration changes', () => {
    const scope = effectScope()
    try {
      scope.run(() => {
        const history = ref(historyTasks)
        const node = ref({ ping, pingDisplay: display })
        const state = usePingChartTasks(history, node)
        expect(state.selectedTaskIds.value).toEqual([8, 4, 2])
        state.selectedTaskIds.value = [8]
        history.value = historyTasks.map(task => ({ ...task, avg: 100 }))
        node.value = { ...node.value, ping: { ...ping, ct: { ...ping.ct!, latest: 101 } } }
        expect(state.selectedTaskIds.value).toEqual([8])
        node.value.pingDisplay = { ...display, count: 4, names: { node_4: '新别名' } }
        expect(state.selectedTaskIds.value).toEqual([8, 5])
        expect(state.selectedTasks.value[0]?.name).toBe('新别名')
        node.value.pingDisplay = { ...display, count: 4, order: ['node_1', ...priority] }
        expect(state.selectedTaskIds.value).toEqual([5, 8])
        node.value.pingDisplay = { ...display, count: 4, enabled: ['node_1', 'cu'] }
        expect(state.selectedTaskIds.value).toEqual([5])
        state.selectedTaskIds.value = []
        history.value = [...historyTasks]
        expect(state.selectedTaskIds.value).toEqual([])
        node.value.pingDisplay = { ...display, enabled: [] }
        expect(state.tasks.value).toEqual([])
        expect(state.selectedTaskIds.value).toEqual([])
      })
    }
    finally {
      scope.stop()
    }
  })

  it('uses global defaults and per-machine overrides even when the history adapter returns every old slot', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ping_display_count: 2, ping_display_order: priority, node_4_name: '全局移动' }))))
    await fetchSiteConfigs()
    const global = adaptServer({ id: 'global', ping_ct: 10, ping_node_4: 80, ping_bd: 40 }, 0)
    const own = adaptServer({ id: 'own', ping_display: { ...display, count: 1, order: ['cu'], enabled: ['cu'], names: { cu: '单机联通' } } }, 0)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { timestamp: Date.parse('2026-10-11T01:00:00Z'), ping_ct: 10, ping_cu: 20, ping_cm: 30, ping_bd: 40, ping_node_4: 80 },
    ]))))
    const history = await fetchPingHistory('own')
    expect(history.tasks).toHaveLength(5)
    expect(buildPingChartTasks(history.tasks, global.status.ping, global.status.pingDisplay).map(task => [task.id, task.name])).toEqual([[8, '全局移动'], [4, 'BGP']])
    expect(buildPingChartTasks(history.tasks, own.status.ping, own.status.pingDisplay).map(task => [task.id, task.name])).toEqual([[2, '单机联通']])
  })
})
