import type { CfServer } from '@/utils/api'
import type { BackendPingDisplay } from '@/utils/backendPingDisplay'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import NodeCard from '@/components/NodeCard.vue'
import NodePingListCell from '@/components/NodePingListCell.vue'
import { buildTopPingNetworks } from '@/composables/useNodePingDisplay'
import { useNodesStore } from '@/stores/nodes'
import { adaptServer, fetchSiteConfigs, getApiBases } from '@/utils/api'
import { PING_KEYS } from '@/utils/backendPingDisplay'

const priority = ['node_4', 'bd', 'cu', 'node_1', 'cm', 'node_2', 'ct', 'node_3'] as const

function server(count: number, extra: Partial<CfServer> = {}): CfServer {
  return {
    id: 'hk',
    name: '香港',
    ping_ct: 10,
    ping_cu: 20,
    ping_cm: 30,
    ping_bd: 40,
    ping_node_1: 50,
    ping_node_2: 60,
    ping_node_3: 70,
    ping_node_4: 80,
    ping_display: {
      order: [...priority],
      count,
      enabled: [...PING_KEYS],
      names: { node_4: '上海移动', bd: '广州电信' },
    },
    ...extra,
  }
}

describe('backend Ping display in Emerald', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('renders the configured %i results in cards and lists', async (count) => {
    const adapted = adaptServer(server(count), 0)
    const store = useNodesStore()
    store.configurePingHistory({ showThreeNetDetails: false })
    store.initNodes({ hk: adapted.client }, { hk: adapted.status })
    const node = store.nodes[0]!
    for (const component of [NodeCard, NodePingListCell]) {
      const app = createSSRApp({ render: () => h(component, { node }) })
      app.use(createPinia())
      const html = await renderToString(app)
      const keys = Array.from(html.matchAll(/data-ping-key="([^"]+)"/g), match => match[1])
      expect(keys).toEqual(priority.slice(0, count))
      expect(html).toContain('上海移动')
      expect(html).toContain('80 ms')
    }
  })

  it('filters disabled slots before applying the count and allows all slots to be disabled', () => {
    const configured = server(3).ping_display!
    const adapted = adaptServer(server(3, { ping_display: { ...configured, enabled: ['node_2', 'ct', 'node_3'] } }), 0)
    expect(buildTopPingNetworks(adapted.status.ping, adapted.status.pingDisplay).map(row => row.key)).toEqual(['node_2', 'ct', 'node_3'])
    const disabled = adaptServer(server(8, { ping_display: { ...configured, enabled: [] } }), 0)
    expect(buildTopPingNetworks(disabled.status.ping, disabled.status.pingDisplay)).toEqual([])
  })

  it('keeps each server count and alias through store updates, including a timed-out priority slot', () => {
    const hk = adaptServer(server(2, { ping_node_4: null }), 0)
    const tokyo = adaptServer(server(8, { id: 'tokyo', ping_node_4: 0 }), 0)
    const store = useNodesStore()
    store.initNodes({ hk: hk.client, tokyo: tokyo.client }, { hk: hk.status, tokyo: tokyo.status })
    expect(buildTopPingNetworks(store.nodesByUuid.get('hk')!.ping, store.nodesByUuid.get('hk')!.pingDisplay)[0]).toMatchObject({ name: '上海移动', latency: '超时' })
    expect(buildTopPingNetworks(store.nodesByUuid.get('tokyo')!.ping, store.nodesByUuid.get('tokyo')!.pingDisplay)).toHaveLength(8)
    expect(buildTopPingNetworks(tokyo.status.ping, tokyo.status.pingDisplay)[0]!.latency).toBe('0 ms')
    const { pingDisplay: _display, ...status } = hk.status
    store.updateNodeStatuses({ hk: { ...status, cpu: 50 } })
    expect(store.nodesByUuid.get('hk')!.pingDisplay?.count).toBe(2)
    expect(store.nodesByUuid.get('hk')!.pingDisplay?.names?.node_4).toBe('上海移动')
  })

  it('uses /api/config defaults when the server has no override', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ping_display_count: 5, ping_display_order: priority, node_4_name: '默认移动' }))))
    await fetchSiteConfigs()
    const adapted = adaptServer(server(8, { ping_display: undefined }), 0)
    expect(buildTopPingNetworks(adapted.status.ping, adapted.status.pingDisplay).map(row => row.key)).toEqual(priority.slice(0, 5))
    expect(adapted.status.ping?.node_4?.name).toBe('默认移动')
    const override: BackendPingDisplay = { ...server(2).ping_display!, names: { node_4: '单机移动' } }
    expect(adaptServer(server(2, { ping_display: override }), 0).status.ping?.node_4?.name).toBe('单机移动')
  })

  it('reads configured API origins for static hosting', () => {
    vi.stubGlobal('document', { querySelector: () => ({ content: 'https://backend.example, https://backend.example, javascript:alert(1)' }) })
    expect(getApiBases()).toEqual(['https://backend.example'])
  })
})
