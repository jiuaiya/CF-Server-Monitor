import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeBackendPingDisplay, backendPingTaskIds } from '@/utils/backendPingDisplay';
import { CfsmServerSchema, EMPTY_CARRIER_PING, type HomepagePingDisplayLine } from '@/types/cfsm';
import { toNodeInfo, carrierPingFromServer } from '@/services/cfsm/mappers';
import { withLiveLatency } from '@/hooks/usePingOverview';
import { BackendPingValues } from '@/components/node/BackendPingValues';

describe('backend Ping display integration', () => {
  it('uses all eight stable slots and honors counts 1, 2, 5 and 8', () => {
    for (const count of [1, 2, 5, 8]) {
      const display = normalizeBackendPingDisplay({ order: ['node_4', 'bd', 'node_1', 'ct', 'cu', 'cm', 'node_2', 'node_3'], count })!;
      expect(backendPingTaskIds(display)).toEqual([8, 4, 5, 1, 2, 3, 6, 7].slice(0, count));
    }
  });
  it('keeps server aliases and timeout slots in their configured position while excluding disabled slots', () => {
    const server = CfsmServerSchema.parse({ id: 'node', ping_node_4: null, ping_ct: 0, ping_display: {
      order: ['node_4', 'ct', 'cu'], count: 5, enabled: ['ct', 'node_4'], names: { node_4: '优先节点', ct: '单机电信' }
    } });
    const info = toNodeInfo(server);
    expect(backendPingTaskIds(info.pingDisplay!)).toEqual([8, 1]);
    expect(info.pingDisplay?.names?.ct).toBe('单机电信');
    expect(carrierPingFromServer(server).node_4).toBe(-1);
    expect(carrierPingFromServer(server).ct).toBe(0);
  });
  it('distinguishes no enabled slots from a legacy backend without display settings', () => {
    expect(normalizeBackendPingDisplay(undefined)).toBeUndefined();
    expect(normalizeBackendPingDisplay({ order: undefined, count: undefined })).toBeUndefined();
    expect(backendPingTaskIds(normalizeBackendPingDisplay({ count: 8, enabled: [] })!)).toEqual([]);
    const invalid = normalizeBackendPingDisplay({ order: ['ct', 'ct', 'unknown'], count: 20 })!;
    expect(invalid.order).toHaveLength(8);
    expect(invalid.count).toBe(3);
  });
  it('does not replace the latest timeout with an older successful sample', () => {
    const item = { client: 'node', isAssigned: true, lastValue: 33, samples: [], max: 100, loss: 0 };
    const timedOut = withLiveLatency(item, { ...EMPTY_CARRIER_PING, node_4: -1 }, 8, true);
    expect(timedOut.lastValue).toBeNull();
    expect(timedOut.timedOut).toBe(true);
    expect(withLiveLatency(timedOut, { ...EMPTY_CARRIER_PING, node_4: 0 }, 8, true).lastValue).toBe(0);
  });
  it('compact layouts render the configured number, aliases, 0ms and explicit timeouts', () => {
    const display = normalizeBackendPingDisplay({ count: 5 })!;
    const lines = backendPingTaskIds(display).map((taskId, index) => ({ taskId, taskName: `节点 ${index + 1}`, client: 'node', isAssigned: true, lastValue: index === 0 ? 0 : 20, samples: [], buckets: [], max: 20, loss: 0, timedOut: index === 4 })) as HomepagePingDisplayLine[];
    const markup = renderToStaticMarkup(<BackendPingValues lines={lines} />);
    expect(markup.match(/data-ping-task=/g)).toHaveLength(5);
    expect(markup).toContain('0ms');
    expect(markup).toContain('超时');
    expect(markup).toContain('节点 5');
  });
});
