export interface LossHeatmapRecord {
  task_id: number
  time: string
  value: number
  loss?: number | null
  metric?: 'latency' | 'loss'
}

export interface LossHeatmapCell {
  taskId: number
  row: number
  start: number
  end: number
  maximum: number | null
  average: number | null
  samples: number
}

export const LOSS_HEATMAP_LEVELS = [
  { label: '0%', light: '#d1fae5', dark: '#164e3a' },
  { label: '≤5%', light: '#fde68a', dark: '#a3872d' },
  { label: '≤20%', light: '#fbbf24', dark: '#dba322' },
  { label: '<100%', light: '#fb923c', dark: '#e47828' },
  { label: '100%', light: '#f43f5e', dark: '#f43f5e' },
  { label: '无数据', light: '#e5e7eb', dark: '#41454c' },
] as const

export function lossHeatmapColor(value: number | null, dark = false): string {
  const index = value === null ? 5 : value === 0 ? 0 : value <= 5 ? 1 : value <= 20 ? 2 : value < 100 ? 3 : 4
  return LOSS_HEATMAP_LEVELS[index]![dark ? 'dark' : 'light']
}

/** Uniform time bins share the latency domain; missing samples never become healthy probes. */
export function buildLossHeatmap(records: LossHeatmapRecord[], taskIds: number[], hours: number, maxBins = 120) {
  const timestamps = records.map(record => Date.parse(record.time)).filter(Number.isFinite)
  const end = timestamps.length ? Math.max(...timestamps) : Date.now()
  const start = end - hours * 3_600_000
  const intervals = taskIds.flatMap((id) => {
    const times = [...new Set(records.filter(record => record.task_id === id).map(record => Date.parse(record.time)).filter(time => Number.isFinite(time) && time >= start && time <= end))].sort((a, b) => a - b)
    return times.slice(1).map((time, index) => time - times[index]!).filter(delta => delta > 0)
  }).sort((a, b) => a - b)
  const cadence = intervals.length ? intervals[Math.floor(intervals.length / 2)]! : null
  // Do not invent empty slots between regularly sampled probes just because the screen is wide.
  const cadenceBins = cadence ? Math.ceil((end - start) / cadence) : maxBins
  const bins = Math.max(1, Math.min(240, Math.floor(maxBins), cadenceBins))
  const bucketMs = (end - start) / bins
  const samples = new Map<string, Map<string, { loss: number, explicit: boolean }>>()
  const rows = new Map(taskIds.map((id, row) => [id, row]))
  for (const record of records) {
    if (!rows.has(record.task_id))
      continue
    const time = Date.parse(record.time)
    if (!Number.isFinite(time) || time < start || time > end)
      continue
    const explicit = typeof record.loss === 'number' && Number.isFinite(record.loss) && record.loss >= 0 && record.loss <= 100
    const loss = explicit ? record.loss! : record.metric !== 'loss' && record.value < 0 ? 100 : null
    if (loss === null)
      continue
    const bucket = Math.min(bins - 1, Math.floor((time - start) / bucketMs))
    const key = `${record.task_id}:${bucket}`
    const bucketSamples = samples.get(key) ?? new Map()
    // Explicit loss wins over a latency-only timeout at the same timestamp.
    const previous = bucketSamples.get(String(time))
    if (!previous?.explicit || explicit)
      bucketSamples.set(String(time), { loss, explicit })
    samples.set(key, bucketSamples)
  }
  const cells = taskIds.flatMap((taskId, row) => Array.from({ length: bins }, (_, index): LossHeatmapCell => {
    const values = Array.from(samples.get(`${taskId}:${index}`)?.values() ?? [], sample => sample.loss)
    return {
      taskId,
      row,
      start: start + index * bucketMs,
      end: start + (index + 1) * bucketMs,
      maximum: values.length ? Math.max(...values) : null,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      samples: values.length,
    }
  }))
  return { start, end, cells }
}
