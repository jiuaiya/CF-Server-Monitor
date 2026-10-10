import type { CfServer } from '@/utils/api'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import NodeCard from '@/components/NodeCard.vue'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
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
    ping_display: { count: 2, order: ['node_4', 'bd', ...PING_KEYS], enabled: [...PING_KEYS] },
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

  it('shows latency, loss and ten separated bars even when backend history is disabled', async () => {
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
    expect(html).toContain('aria-label="香港 延迟"')
    expect(html).toContain('aria-label="香港 丢包"')
    expect(html).toContain('50 ms')
    expect(html).toContain('4.0%')
    expect(html).toContain('data-ping-history="latency"')
    expect(html).toContain('data-ping-history="loss"')
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
})
