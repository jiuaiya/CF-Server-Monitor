export interface PacketLossRecord {
  task_id: number
  time: string
  value: number
  loss?: number | null
  metric?: 'latency' | 'loss'
}

export interface PacketLossEvent {
  id: string
  taskId: number
  name: string
  time: string
  timestamp: number
  loss: number
}

export function getPingTimeRange(records: PacketLossRecord[], hours: number) {
  const timestamps = records.map(record => Date.parse(record.time)).filter(Number.isFinite)
  const end = timestamps.length ? Math.max(...timestamps) : Date.now()
  return { start: end - hours * 3_600_000, end }
}

/** Deduplicate before filtering: explicit percentages override inferred timeout records. */
export function buildPacketLossEvents(records: PacketLossRecord[], tasks: Array<{ id: number, name: string }>, hours: number) {
  const { start, end } = getPingTimeRange(records, hours)
  const selected = new Map(tasks.map((task, order) => [task.id, { ...task, order }]))
  const samples = new Map<string, { event: PacketLossEvent, explicit: boolean, order: number }>()
  for (const record of records) {
    const task = selected.get(record.task_id)
    const timestamp = Date.parse(record.time)
    if (!task || !Number.isFinite(timestamp) || timestamp < start || timestamp > end)
      continue
    const explicit = typeof record.loss === 'number' && Number.isFinite(record.loss) && record.loss >= 0 && record.loss <= 100
    const loss = explicit ? record.loss! : record.metric !== 'loss' && record.value < 0 ? 100 : null
    if (loss === null)
      continue
    const id = `${record.task_id}:${timestamp}`
    if (samples.get(id)?.explicit && !explicit)
      continue
    samples.set(id, {
      event: { id, taskId: record.task_id, name: task.name, time: new Date(timestamp).toISOString(), timestamp, loss },
      explicit,
      order: task.order,
    })
  }
  const events = [...samples.values()]
    .filter(sample => sample.event.loss > 0)
    .sort((a, b) => b.event.timestamp - a.event.timestamp || a.order - b.order)
    .map(sample => sample.event)
  return { events, sampleCount: samples.size }
}

export function formatPacketLoss(loss: number): string {
  return loss > 0 && loss < 0.01 ? '<0.01%' : `${Number(loss.toFixed(2))}%`
}
