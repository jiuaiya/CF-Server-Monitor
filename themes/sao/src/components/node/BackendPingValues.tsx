import type { HomepagePingDisplayLine } from '@/types/cfsm';
import { latencyHeatColor } from '@/utils/metricTone';

export function BackendPingValues({ lines }: { lines: HomepagePingDisplayLine[] }) {
  return <div className="backend-ping-values" role="group" aria-label="各节点 Ping 结果">
    {lines.map(line => <div key={line.taskId} className="backend-ping-value" data-ping-task={line.taskId} title={`${line.taskName} · ${line.timedOut ? '超时' : line.lastValue == null ? '无样本' : line.lastValue + ' ms'}`}>
      <span>{line.taskName}</span>
      <strong className="tabular" style={{ color: line.timedOut ? 'var(--status-error)' : latencyHeatColor(line.lastValue) }}>{line.timedOut ? '超时' : line.lastValue == null ? '—' : `${Math.round(line.lastValue)}ms`}</strong>
      <small>{line.loss == null ? '—' : `${line.loss.toFixed(1)}%`}</small>
    </div>)}
  </div>;
}
