import type { LossHeatmapRecord } from '@/utils/pingLossHeatmap'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adaptServer, fetchPingHistory } from '@/utils/api'
import { buildLossHeatmap, lossHeatmapColor } from '@/utils/pingLossHeatmap'

const end = Date.parse('2026-10-11T01:00:00Z')
function sample(task: number, minutesAgo: number, loss?: number, extra: Partial<LossHeatmapRecord> = {}): LossHeatmapRecord {
  return { task_id: task, time: new Date(end - minutesAgo * 60000).toISOString(), value: 50, loss, ...extra }
}

afterEach(() => vi.unstubAllGlobals())

describe('packet loss timeline', () => {
  it('keeps loss-only outages on the shared time domain without latency records', () => {
    const result = buildLossHeatmap([sample(1, 5, 100, { metric: 'loss', value: -1 })], [1], 1, 12)
    expect(result.end).toBe(end - 5 * 60000)
    expect(result.end - result.start).toBe(3600000)
    expect(result.cells.at(-1)).toMatchObject({ maximum: 100, average: 100, samples: 1 })
    expect(result.cells[0]?.maximum).toBeNull()
  })

  it('uses the maximum to retain short outages and exposes the average separately', () => {
    const result = buildLossHeatmap([sample(1, 2, 0), sample(1, 1, 100), sample(1, 0, 0)], [1], 1, 12)
    expect(result.cells.at(-1)).toMatchObject({ maximum: 100, average: 100 / 3, samples: 3 })
  })

  it('separates missing measurements, zero loss and timeouts', () => {
    const result = buildLossHeatmap([sample(1, 0, 0), sample(2, 0), sample(3, 0, undefined, { value: -1 })], [1, 2, 3], 1, 1)
    expect(result.cells.map(cell => cell.maximum)).toEqual([0, null, 100])
    expect(new Set(result.cells.map(cell => lossHeatmapColor(cell.maximum))).size).toBe(3)
  })

  it('uses explicit percentage records instead of double-counting a matching timeout', () => {
    const result = buildLossHeatmap([
      sample(1, 0, undefined, { value: -1 }),
      sample(1, 0, 20, { metric: 'loss', value: -1 }),
    ], [1], 1, 1)
    expect(result.cells[0]).toMatchObject({ maximum: 20, average: 20, samples: 1 })
  })

  it('keeps all eight rows in selected order and excludes other tasks', () => {
    const order = [8, 3, 1, 7, 5, 2, 4, 6]
    const records = Array.from({ length: 9 }, (_, index) => sample(index + 1, 0, index))
    const result = buildLossHeatmap(records, order, 1, 2)
    expect(result.cells.filter(cell => cell.maximum !== null).map(cell => [cell.taskId, cell.row, cell.maximum])).toEqual(order.map((id, row) => [id, row, id - 1]))
  })

  it('discards invalid and out-of-window samples without filling gaps as healthy', () => {
    const result = buildLossHeatmap([sample(1, 61, 100), sample(1, 0, 0), sample(1, 0, 100, { time: 'bad time' })], [1], 1, 12)
    expect(result.cells.filter(cell => cell.samples)).toHaveLength(1)
    expect(result.cells.filter(cell => cell.maximum === null)).toHaveLength(11)
  })

  it('does not insert false missing slots between regular one-minute probes', () => {
    const records = Array.from({ length: 61 }, (_, minute) => sample(1, minute, 0))
    const result = buildLossHeatmap(records, [1], 1, 180)
    expect(result.cells).toHaveLength(60)
    expect(result.cells.every(cell => cell.maximum === 0)).toBe(true)
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
    expect(buildLossHeatmap(history.records, [1, 2, 3], 1, 1).cells.map(cell => cell.maximum)).toEqual([0, null, 100])
  })
})
