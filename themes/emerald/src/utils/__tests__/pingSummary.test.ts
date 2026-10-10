import type { CfServer } from '@/utils/api'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import NodeCard from '@/components/NodeCard.vue'
import NodePingListCell from '@/components/NodePingListCell.vue'
import { buildTargetPingBars, useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useNodesStore } from '@/stores/nodes'
import { adaptServer } from '@/utils/api'
import { PING_KEYS } from '@/utils/backendPingDisplay'

const start = Date.parse('2026-10-10T10:00:00Z')
function fixture(extra: Partial<CfServer> = {}): CfServer {
  return {
    id: 'hk',
    name: '香港',
    last_updated: start,
    ping_ct: 900,
    loss_ct: 100,
    ping_bd: 100,
    loss_bd: 8,
    ping_node_4: 0,
    loss_node_4: 0,
    ping_display: { count: 2, order: ['node_4', 'bd', ...PING_KEYS], enabled: [...PING_KEYS], names: { node_4: '移动', bd: '电信' } },
    ...extra,
  }
}

describe('homepage Ping summary', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows each target Ping and loss without a bottom average, even when backend history is disabled', async () => {
    const { client, status } = adaptServer(fixture(), 0)
    const store = useNodesStore()
    store.configurePingHistory({ showThreeNetDetails: false })
    store.initNodes({ hk: client }, { hk: status })
    const display = useNodePingDisplay('hk')
    expect(display.latencyDisplay.value).toBe('50 ms')
    expect(display.lossDisplay.value).toBe('4.0%')
    expect(display.latencyRenderBars.value).toHaveLength(10)
    expect(display.latencyRenderBars.value.filter(bar => bar.className === 'bg-muted-foreground/10')).toHaveLength(9)
    const app = createSSRApp({ render: () => h(NodeCard, { node: store.nodes[0]! }) })
    app.use(pinia)
    const html = await renderToString(app)
    expect(html).toContain('aria-label="移动 Ping 0 ms"')
    expect(html).toContain('aria-label="移动 丢包 0.0%"')
    expect(html).toContain('100 ms')
    expect(html).toContain('8.0%')
    expect(html).not.toContain('50 ms')
    expect(html).not.toContain('4.0%')
    expect(html).not.toContain('data-ping-history=')
    expect(html).toContain('data-ping-target-history="node_4"')
    expect(html).toContain('data-ping-target-loss-history="node_4"')
  })

  it('uses custom slots and only displayed nodes for historical averages', () => {
    const { client, status } = adaptServer(fixture({
      ping: [
        { ts: start, ct: 900, bd: 100, node_4: 0 },
        { ts: start + 360000, ct: 900, bd: 180, node_4: 120 },
      ],
      loss: [
        { ts: start, ct: 100, bd: 8, node_4: 0 },
        { ts: start + 360000, ct: 100, bd: 10, node_4: 2 },
      ],
    }), 0)
    const store = useNodesStore()
    store.initNodes({ hk: client }, { hk: status })
    const display = useNodePingDisplay('hk')
    expect(display.latencyDisplay.value).toBe('100 ms')
    expect(display.lossDisplay.value).toBe('5.0%')
    expect(store.pingHistoryByUuid.hk).toHaveLength(2)
  })

  it('does not report zero latency when selected nodes have all timed out', () => {
    const { client, status } = adaptServer(fixture({ ping_bd: null, ping_node_4: null, loss_bd: 100, loss_node_4: 100 }), 0)
    const store = useNodesStore()
    store.initNodes({ hk: client }, { hk: status })
    const display = useNodePingDisplay('hk')
    expect(display.latencyDisplay.value).toBe('-')
    expect(display.lossDisplay.value).toBe('100.0%')
  })

  it('replaces a successful sample with timeout when the latest update is in the same bucket', () => {
    const initial = adaptServer(fixture(), 0)
    const store = useNodesStore()
    store.initNodes({ hk: initial.client }, { hk: initial.status })
    const timedOut = adaptServer(fixture({ last_updated: start + 1000, ping_bd: null, ping_node_4: null, loss_bd: 100, loss_node_4: 100 }), 0)
    store.updateNodeStatuses({ hk: timedOut.status })
    expect(useNodePingDisplay('hk').latencyDisplay.value).toBe('-')
    expect(useNodePingDisplay('hk').lossDisplay.value).toBe('100.0%')
  })

  it('keeps the configured history window when only the backend visibility flag changes', () => {
    const store = useNodesStore()
    store.configurePingHistory({ points: 20, hours: 2 })
    store.configurePingHistory({ showThreeNetDetails: false })
    const initial = adaptServer(fixture(), 0)
    store.initNodes({ hk: initial.client }, { hk: initial.status })
    store.updateNodeStatuses({ hk: adaptServer(fixture({ last_updated: start + 180000 }), 0).status })
    expect(store.pingHistoryByUuid.hk).toHaveLength(1)
  })

  it('hides the summary when every Ping target is disabled', () => {
    const initial = adaptServer(fixture({ ping_display: { count: 2, order: [...PING_KEYS], enabled: [] } }), 0)
    const store = useNodesStore()
    store.initNodes({ hk: initial.client }, { hk: initial.status })
    expect(useNodePingDisplay('hk').summaryVisible.value).toBe(false)
  })

  it('renders separate target history in cards and lists using their own measurements', async () => {
    const initial = adaptServer(fixture({
      ping: [{ ts: start, bd: 280, node_4: 0 }, { ts: start + 120000, bd: 280, node_4: 0 }],
      loss: [{ ts: start, bd: 0, node_4: 0 }, { ts: start + 120000, bd: 0, node_4: 0 }],
    }), 0)
    const store = useNodesStore()
    store.initNodes({ hk: initial.client }, { hk: initial.status })
    const history = store.pingHistoryByUuid.hk!
    const mobile = buildTargetPingBars(history, 'node_4', '移动')
    const telecom = buildTargetPingBars(history, 'bd', '电信')
    expect(mobile).toHaveLength(10)
    expect(mobile.at(-1)).toMatchObject({ className: 'bg-emerald-600/90', tooltip: expect.stringContaining('0 ms') })
    expect(telecom.at(-1)).toMatchObject({ className: 'bg-rose-500/80', tooltip: expect.stringContaining('280 ms') })
    expect(buildTargetPingBars(history, 'bd', '电信', 'loss').at(-1)).toMatchObject({ className: 'bg-emerald-600/90', tooltip: expect.stringContaining('丢包 0.0%') })
    expect(buildTargetPingBars(history, 'cu', '联通').at(-1)?.tooltip).toContain('N/A')
    for (const component of [NodeCard, NodePingListCell]) {
      const app = createSSRApp({ render: () => h(component, { node: store.nodes[0]! }) })
      app.use(pinia)
      const html = await renderToString(app)
      expect(Array.from(html.matchAll(/data-ping-target-history="([^"]+)"/g), match => match[1])).toEqual(['node_4', 'bd'])
      expect(Array.from(html.matchAll(/data-ping-target-loss-history="([^"]+)"/g), match => match[1])).toEqual(['node_4', 'bd'])
      expect(html).not.toContain('data-ping-history=')
    }
  })

  it('records separate live values even when the aggregate is unchanged and replaces same-bucket timeouts', () => {
    const store = useNodesStore()
    store.configurePingHistory({ showThreeNetDetails: false })
    const initial = adaptServer(fixture({ ping_bd: 100, ping_node_4: 0, loss_bd: 0 }), 0)
    store.initNodes({ hk: initial.client }, { hk: initial.status })
    store.updateNodeStatuses({ hk: adaptServer(fixture({ last_updated: start + 1000, ping_bd: 0, ping_node_4: 100, loss_bd: 0 }), 0).status })
    expect(useNodePingDisplay('hk').latencyDisplay.value).toBe('50 ms')
    expect(buildTargetPingBars(store.pingHistoryByUuid.hk!, 'node_4', '移动').at(-1)?.tooltip).toContain('100 ms')
    store.updateNodeStatuses({ hk: adaptServer(fixture({ last_updated: start + 2000, ping_node_4: null, loss_node_4: 100 }), 0).status })
    expect(buildTargetPingBars(store.pingHistoryByUuid.hk!, 'node_4', '移动').at(-1)).toMatchObject({ className: 'bg-rose-500/80', tooltip: expect.stringContaining('超时') })
  })

  it('keeps loss-only timeout buckets alongside successful latency buckets', () => {
    const initial = adaptServer(fixture({
      ping: [{ ts: start, node_4: 50 }],
      loss: [{ ts: start, node_4: 0 }, { ts: start + 120000, node_4: 100 }],
    }), 0)
    expect(initial.status.pingWindow).toHaveLength(2)
    const bars = buildTargetPingBars(initial.status.pingWindow!, 'node_4', '移动')
    expect(bars.at(-1)).toMatchObject({ className: 'bg-rose-500/80', tooltip: expect.stringContaining('丢包 100.0%') })
    expect(buildTargetPingBars(initial.status.pingWindow!, 'node_4', '移动', 'loss').at(-1)).toMatchObject({ className: 'bg-rose-500/80', tooltip: expect.stringContaining('丢包 100.0%') })
    expect(buildTargetPingBars(initial.status.pingWindow!, 'node_4', '移动', 'loss').at(-2)).toMatchObject({ className: 'bg-emerald-600/90', tooltip: expect.stringContaining('丢包 0.0%') })
  })
})
