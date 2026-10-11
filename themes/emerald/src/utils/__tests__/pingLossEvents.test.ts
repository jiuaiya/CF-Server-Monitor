import type { PacketLossRecord } from '@/utils/pingLossEvents'
import { renderToString } from '@vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import PacketLossEvents from '@/components/PacketLossEvents.vue'
import { adaptServer, fetchPingHistory } from '@/utils/api'
import { buildPacketLossEvents, formatPacketLoss, getPingTimeRange } from '@/utils/pingLossEvents'

const end = Date.parse('2026-10-11T01:00:00Z')
const tasks = [{ id: 1, name: '电信' }, { id: 2, name: '联通' }, { id: 3, name: '移动' }]
function sample(task: number, minutesAgo: number, loss?: number, extra: Partial<PacketLossRecord> = {}): PacketLossRecord {
  return { task_id: task, time: new Date(end - minutesAgo * 60000).toISOString(), value: 50, loss, ...extra }
}

afterEach(() => vi.unstubAllGlobals())

describe('packet loss event list', () => {
  it('includes loss-only samples and sorts precise records newest first', () => {
    const records = [sample(1, 2, 35), sample(2, 0, 100, { metric: 'loss', value: -1 }), sample(1, 1, 3.2)]
    const result = buildPacketLossEvents(records, tasks, 1)
    expect(result.events.map(event => [event.name, event.time, event.loss])).toEqual([
      ['联通', new Date(end).toISOString(), 100],
      ['电信', new Date(end - 60000).toISOString(), 3.2],
      ['电信', new Date(end - 120000).toISOString(), 35],
    ])
    expect(getPingTimeRange(records, 1)).toEqual({ start: end - 3600000, end })
  })

  it('preserves individual consecutive loss records instead of aggregating them', () => {
    const result = buildPacketLossEvents([sample(1, 2, 5), sample(1, 1, 100), sample(1, 0, 5)], tasks, 1)
    expect(result.events.map(event => event.loss)).toEqual([5, 100, 5])
  })

  it('excludes healthy and missing samples but includes known timeouts', () => {
    const result = buildPacketLossEvents([sample(1, 0, 0), sample(2, 0), sample(3, 0, undefined, { value: -1 })], tasks, 1)
    expect(result.sampleCount).toBe(2)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ name: '移动', loss: 100 })
  })

  it('lets explicit percentages override duplicate inferred timeouts, including 0%', () => {
    const result = buildPacketLossEvents([
      sample(1, 0, undefined, { value: -1 }),
      sample(1, 0, 20, { metric: 'loss', value: -1 }),
      sample(2, 0, undefined, { value: -1 }),
      sample(2, 0, 0, { metric: 'loss', value: -1 }),
    ], tasks, 1)
    expect(result.events.map(event => [event.name, event.loss])).toEqual([['电信', 20]])
    expect(result.sampleCount).toBe(2)
  })

  it('filters selected nodes and keeps their configured order for simultaneous events', () => {
    const order = [8, 3, 1, 7, 5, 2, 4, 6]
    const records = Array.from({ length: 9 }, (_, index) => sample(index + 1, 0, 10))
    const result = buildPacketLossEvents(records, order.map(id => ({ id, name: `节点${id}` })), 1)
    expect(result.events.map(event => event.taskId)).toEqual(order)
  })

  it('excludes invalid and out-of-window samples', () => {
    const result = buildPacketLossEvents([sample(1, 61, 100), sample(1, 0, 3), sample(1, 0, 100, { time: 'bad time' })], tasks, 1)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.loss).toBe(3)
  })

  it('does not round a small positive loss to zero', () => {
    expect(formatPacketLoss(0.004)).toBe('<0.01%')
    expect(formatPacketLoss(3.2)).toBe('3.2%')
    expect(formatPacketLoss(100)).toBe('100%')
  })

  it('renders the requested columns, ten records per page and distinct empty states', async () => {
    const result = buildPacketLossEvents(Array.from({ length: 12 }, (_, minute) => sample(1, minute, 10)), tasks, 1)
    const render = (events = result.events, hasSamples = true) => renderToString(createSSRApp({ render: () => h(PacketLossEvents, { events, hasSamples }) }))
    const html = await render()
    expect(html).toContain('节点')
    expect(html).toContain('发生时间')
    expect(html).toContain('丢包率')
    expect(html.match(/data-loss-event-id=/g)).toHaveLength(10)
    expect(html).toContain('下一页')
    expect(await render([], true)).toContain('所选时间内没有丢包异常')
    expect(await render([], false)).toContain('所选时间内暂无丢包数据')
  })

  it('preserves 0ms and unknown loss through the CF history adapter', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    adaptServer({ id: 'hk' }, 0)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { timestamp: end, ping_ct: 0, loss_ct: 0, ping_cu: 50, ping_cm: null, loss_cm: 100 },
    ]))))
    const history = await fetchPingHistory('hk')
    expect(history.records.find(record => record.task_id === 1)).toMatchObject({ value: 0, loss: 0 })
    expect(history.records.find(record => record.task_id === 2)).toMatchObject({ value: 50, loss: undefined })
    expect(buildPacketLossEvents(history.records, tasks, 1).events.map(event => [event.name, event.loss])).toEqual([['移动', 100]])
  })
})
